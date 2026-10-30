//! 词锚桌面端的 Tauri 入口。
//!
//! 职责边界：窗口 / 托盘 / 单实例 / 插件注册 / 本地 API 的生命周期在这里，
//! 业务逻辑全部在前端（`src/lib/*.ts`）。

mod api;
mod inbox;
mod port_file;

use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WindowEvent,
};

/// 本地 API 的运行时状态：前端用 `get_api_info` 读它
#[derive(Default)]
pub struct ApiState {
    port: Mutex<Option<u16>>,
}

#[derive(serde::Serialize)]
pub struct ApiInfo {
    /// 还没绑定成功时为 null（前端显示「启动中」）
    port: Option<u16>,
}

#[tauri::command]
fn get_api_info(state: tauri::State<'_, ApiState>) -> ApiInfo {
    ApiInfo {
        port: state.port.lock().ok().and_then(|slot| *slot),
    }
}

/// 收件箱里所有待收录的 payload，按到达时间排序
#[tauri::command]
fn inbox_list(app: AppHandle) -> Result<Vec<inbox::InboxItem>, String> {
    let dir = inbox::inbox_dir(&app_data_dir(&app)?);
    inbox::list(&dir).map_err(|error| format!("读取收件箱失败：{error}"))
}

/// 收录成功后删掉那一条；文件已经不在了也算成功
#[tauri::command]
fn inbox_remove(app: AppHandle, path: String) -> Result<(), String> {
    let dir = inbox::inbox_dir(&app_data_dir(&app)?);

    match inbox::remove(&dir, &path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("删除收件箱文件失败：{error}")),
    }
}

fn app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("找不到应用数据目录：{error}"))
}

/// 托盘菜单的「显示词锚」与第二次启动都回到这里
fn focus_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示词锚", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("word-anchor-tray")
        .menu(&menu)
        /* 左键留给「显示窗口」，菜单走右键 */
        .show_menu_on_left_click(false)
        .tooltip("词锚 Word Anchor");

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => focus_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        /* 单实例必须是第一个注册的插件：第二次启动只聚焦已有窗口 */
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main(app);
        }))
        /* 开机自启默认关；带 --hidden 启动时直接进托盘 */
        .plugin(tauri_plugin_autostart::Builder::new().arg("--hidden").build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(ApiState::default())
        .invoke_handler(tauri::generate_handler![
            get_api_info,
            inbox_list,
            inbox_remove
        ])
        .setup(|app| {
            setup_tray(app)?;

            if std::env::args().any(|arg| arg == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(api::serve(handle));

            Ok(())
        })
        .on_window_event(|window, event| {
            /* 关窗 = 收进托盘：Anki 推送与后台收录都不能因为「关掉界面」而停 */
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("词锚启动失败")
        .run(|_app, event| {
            if let RunEvent::Exit = event {
                port_file::clear();
            }
        });
}
