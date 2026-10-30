//! 本地 HTTP API（axum，只绑 127.0.0.1）。
//!
//! 契约见 `README.md` 的「本地 API」一节；这里只做三件事：
//! 1. 严格校验 wire v1 的 JSON body；
//! 2. 把校验过的 payload 原子写进 `inbox/`；
//! 3. 发 `anki:intake` 事件，让 WebView 立刻来取。
//!
//! 数据库不在这里写：Rust 与前端各有一条 SQLite 连接，收件箱文件是唯一的交接点。

use std::{
    io,
    net::{Ipv4Addr, SocketAddr},
};

use axum::{
    body::{to_bytes, Body},
    extract::{ConnectInfo, DefaultBodyLimit, Request, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::TcpListener;

use crate::{inbox, port_file, ApiState};

/// 端口探测范围：8770 起，最多顺延到 8789
pub const PORT_MIN: u16 = 8770;
pub const PORT_MAX: u16 = 8789;

pub const WIRE_VERSION: u64 = 1;
pub const MAX_ENTRIES: usize = 200;
pub const MAX_TERM_CHARS: usize = 80;
pub const MAX_MEANING_CHARS: usize = 300;
/// body 上限 512KB（`to_bytes` 多给 1 字节，好区分「刚好超限」与「读失败」）
pub const MAX_BODY_BYTES: usize = 512 * 1024;

pub const EVENT_NAME: &str = "anki:intake";

/// 允许的 Host（防 DNS rebinding）：只认本机与 WebView 自己的名字
const ALLOWED_HOSTS: &[&str] = &["127.0.0.1", "localhost", "tauri.localhost", "[::1]"];
/// 允许的 Origin：词锚自己的 WebView（生产）与 next dev（开发）。
/// Anki 插件的 urllib 请求不带 Origin，因此天然放行。
const ALLOWED_ORIGINS: &[&str] = &[
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
];

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
struct IntakeWord {
    term: String,
    #[serde(default)]
    meaning: String,
    #[serde(
        rename = "capturedAt",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    captured_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
struct WirePayload {
    v: u64,
    source: String,
    words: Vec<IntakeWord>,
}

#[derive(Debug, Serialize)]
struct IntakeResponse {
    accepted: usize,
}

#[derive(Debug, Serialize)]
struct HealthResponse {
    ok: bool,
    app: &'static str,
    port: u16,
}

/// 启动时按 8770..=8789 顺序找一个能绑的端口。
pub async fn bind_preferred() -> io::Result<(TcpListener, u16)> {
    bind_first(PORT_MIN..=PORT_MAX).await
}

/// 依次尝试给定端口，返回第一个绑定成功的监听器。
pub async fn bind_first(ports: impl IntoIterator<Item = u16>) -> io::Result<(TcpListener, u16)> {
    let mut last_error = None;

    for port in ports {
        match TcpListener::bind((Ipv4Addr::LOCALHOST, port)).await {
            Ok(listener) => return Ok((listener, port)),
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| io::Error::other("没有可用的本地端口")))
}

pub fn router(app: AppHandle) -> Router {
    Router::new()
        .route("/api/v1/intake", post(intake))
        .route("/api/v1/health", get(health))
        .fallback(not_found)
        /* body 上限自己管，好回 400 JSON 而不是 axum 默认的 413 文本 */
        .layer(DefaultBodyLimit::disable())
        .layer(middleware::from_fn(guard))
        .with_state(app)
}

/// 后台任务：绑定端口 → 写端口文件 → 开始服务。
pub async fn serve(app: AppHandle) {
    let (listener, port) = match bind_preferred().await {
        Ok(found) => found,
        Err(error) => {
            eprintln!("[word-anchor] 本地 API 无法绑定 127.0.0.1:{PORT_MIN}-{PORT_MAX}：{error}");
            return;
        }
    };

    if let Ok(mut slot) = app.state::<ApiState>().port.lock() {
        *slot = Some(port);
    }

    if let Err(error) = port_file::write(port) {
        eprintln!("[word-anchor] 端口文件写入失败：{error}");
    }
    eprintln!("[word-anchor] 本地 API 监听 http://127.0.0.1:{port}");

    let service = router(app).into_make_service_with_connect_info::<SocketAddr>();
    if let Err(error) = axum::serve(listener, service).await {
        eprintln!("[word-anchor] 本地 API 已停止：{error}");
    }
}

async fn intake(State(app): State<AppHandle>, body: Body) -> Response {
    let bytes = match to_bytes(body, MAX_BODY_BYTES + 1).await {
        Ok(bytes) => bytes,
        Err(_) => return bad_request("一次推送的内容超过 512KB"),
    };

    let (canonical, accepted) = match validate_payload(&bytes) {
        Ok(validated) => validated,
        Err(message) => return bad_request(&message),
    };

    let Some(app_data) = app.path().app_data_dir().ok() else {
        return server_error("找不到应用数据目录");
    };

    let path = match inbox::write_payload(&inbox::inbox_dir(&app_data), &canonical) {
        Ok(path) => path,
        Err(error) => {
            eprintln!("[word-anchor] 收件箱写入失败：{error}");
            return server_error("收件箱写入失败，请检查磁盘空间与权限");
        }
    };

    if let Err(error) = app.emit(EVENT_NAME, path.to_string_lossy().into_owned()) {
        eprintln!("[word-anchor] 发送 {EVENT_NAME} 事件失败：{error}");
    }

    (StatusCode::OK, Json(IntakeResponse { accepted })).into_response()
}

async fn health(State(app): State<AppHandle>) -> Response {
    let port = app
        .state::<ApiState>()
        .port
        .lock()
        .map(|slot| slot.unwrap_or_default())
        .unwrap_or_default();

    (
        StatusCode::OK,
        Json(HealthResponse {
            ok: true,
            app: "word-anchor",
            port,
        }),
    )
        .into_response()
}

async fn not_found() -> Response {
    error_response(StatusCode::NOT_FOUND, "没有这个接口")
}

/// 只接受本机来源，且 Host / Origin 必须是我们认识的名字。
async fn guard(request: Request, next: Next) -> Response {
    if let Some(ConnectInfo(address)) = request.extensions().get::<ConnectInfo<SocketAddr>>() {
        if !address.ip().is_loopback() {
            return forbidden("只接受本机请求");
        }
    }

    if !host_allowed(request.headers()) {
        return forbidden("Host 不被允许");
    }

    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);

    if let Some(origin) = origin.as_deref() {
        if !ALLOWED_ORIGINS.contains(&origin) {
            return forbidden("Origin 不被允许");
        }
    }

    let mut response = if request.method() == Method::OPTIONS {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(request).await
    };

    if let Some(origin) = origin.as_deref() {
        if let Ok(value) = HeaderValue::from_str(origin) {
            let headers = response.headers_mut();
            headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, value);
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_METHODS,
                HeaderValue::from_static("GET, POST, OPTIONS"),
            );
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_HEADERS,
                HeaderValue::from_static("content-type"),
            );
            headers.insert(header::VARY, HeaderValue::from_static("origin"));
        }
    }

    response
}

fn host_allowed(headers: &HeaderMap) -> bool {
    let Some(host) = headers.get(header::HOST).and_then(|value| value.to_str().ok()) else {
        return false;
    };

    let name = host
        .rsplit_once(':')
        .map(|(name, _port)| name)
        .unwrap_or(host);

    ALLOWED_HOSTS.contains(&name)
}

fn bad_request(message: &str) -> Response {
    error_response(StatusCode::BAD_REQUEST, message)
}

fn forbidden(message: &str) -> Response {
    error_response(StatusCode::FORBIDDEN, message)
}

fn server_error(message: &str) -> Response {
    error_response(StatusCode::INTERNAL_SERVER_ERROR, message)
}

fn error_response(status: StatusCode, message: &str) -> Response {
    (
        status,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}

/// 校验 wire v1，并返回「只含合法字段」的紧凑 JSON。
///
/// 结构性错误一律拒绝（400）：插件因此不会把队列标记成已发送，用户能在预览里
/// 看到问题；单条记录里无关的额外字段则直接丢掉，不让它进收件箱。
fn validate_payload(bytes: &[u8]) -> Result<(String, usize), String> {
    if bytes.len() > MAX_BODY_BYTES {
        return Err("一次推送的内容超过 512KB".to_owned());
    }

    let value: Value = serde_json::from_slice(bytes).map_err(|_| "请求体不是合法的 JSON".to_owned())?;
    let object = value.as_object().ok_or_else(|| "payload 必须是 JSON 对象".to_owned())?;

    match object.get("v") {
        Some(Value::Number(version)) if version.as_u64() == Some(WIRE_VERSION) => {}
        Some(_) => return Err("不支持的协议版本（需要 v: 1）".to_owned()),
        None => return Err("缺少协议版本 v".to_owned()),
    }

    match object.get("source") {
        Some(Value::String(source)) if source == "anki" => {}
        Some(_) => return Err("source 必须是 \"anki\"".to_owned()),
        None => return Err("缺少 source".to_owned()),
    }

    let words = object
        .get("words")
        .and_then(Value::as_array)
        .ok_or_else(|| "words 必须是数组".to_owned())?;

    if words.is_empty() {
        return Err("words 里没有单词".to_owned());
    }
    if words.len() > MAX_ENTRIES {
        return Err(format!("一次最多推送 {MAX_ENTRIES} 个单词"));
    }

    let mut entries = Vec::with_capacity(words.len());
    for (index, item) in words.iter().enumerate() {
        let position = index + 1;
        let item = item
            .as_object()
            .ok_or_else(|| format!("第 {position} 条不是 JSON 对象"))?;

        let term = item
            .get("term")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("第 {position} 条缺少 term"))?;
        if term.trim().is_empty() {
            return Err(format!("第 {position} 条 term 是空的"));
        }
        if term.chars().count() > MAX_TERM_CHARS {
            return Err(format!(
                "第 {position} 条 term 超过 {MAX_TERM_CHARS} 个字符"
            ));
        }

        let meaning = match item.get("meaning") {
            None | Some(Value::Null) => "",
            Some(Value::String(meaning)) => meaning.as_str(),
            Some(_) => return Err(format!("第 {position} 条 meaning 必须是字符串")),
        };
        if meaning.chars().count() > MAX_MEANING_CHARS {
            return Err(format!(
                "第 {position} 条 meaning 超过 {MAX_MEANING_CHARS} 个字符"
            ));
        }

        let captured_at = match item.get("capturedAt") {
            None | Some(Value::Null) => None,
            Some(Value::String(stamp)) if stamp.is_empty() => None,
            Some(Value::String(stamp)) => Some(stamp.clone()),
            Some(_) => return Err(format!("第 {position} 条 capturedAt 必须是字符串")),
        };

        entries.push(IntakeWord {
            term: term.to_owned(),
            meaning: meaning.to_owned(),
            captured_at,
        });
    }

    let accepted = entries.len();
    let payload = WirePayload {
        v: WIRE_VERSION,
        source: "anki".to_owned(),
        words: entries,
    };
    let canonical = serde_json::to_string(&payload).map_err(|error| error.to_string())?;

    Ok((canonical, accepted))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn body(value: serde_json::Value) -> Vec<u8> {
        serde_json::to_vec(&value).unwrap()
    }

    fn valid_body() -> Vec<u8> {
        body(serde_json::json!({
            "v": 1,
            "source": "anki",
            "words": [
                { "term": "lucid", "meaning": "清晰易懂的", "capturedAt": "2024-05-01T09:00:00.000+00:00" },
                { "term": "vivid", "meaning": "生动的" }
            ]
        }))
    }

    #[test]
    fn accepts_valid_payload_and_keeps_captured_at() {
        let (canonical, accepted) = validate_payload(&valid_body()).unwrap();

        assert_eq!(accepted, 2);
        assert_eq!(
            canonical,
            r#"{"v":1,"source":"anki","words":[{"term":"lucid","meaning":"清晰易懂的","capturedAt":"2024-05-01T09:00:00.000+00:00"},{"term":"vivid","meaning":"生动的"}]}"#
        );
    }

    #[test]
    fn drops_unknown_fields_and_defaults_missing_meaning() {
        let (canonical, _) = validate_payload(&body(serde_json::json!({
            "v": 1,
            "source": "anki",
            "noise": true,
            "words": [{ "term": "lucid", "noteId": 42, "capturedAt": "" }]
        })))
        .unwrap();

        assert_eq!(
            canonical,
            r#"{"v":1,"source":"anki","words":[{"term":"lucid","meaning":""}]}"#
        );
    }

    #[test]
    fn rejects_bad_json_and_non_object_payloads() {
        assert!(validate_payload(b"{").unwrap_err().contains("合法的 JSON"));
        assert!(validate_payload(b"[]").unwrap_err().contains("JSON 对象"));
        assert!(validate_payload(b"").unwrap_err().contains("合法的 JSON"));
    }

    #[test]
    fn rejects_wrong_or_missing_version() {
        let wrong = body(serde_json::json!({ "v": 2, "source": "anki", "words": [{ "term": "a" }] }));
        assert!(validate_payload(&wrong).unwrap_err().contains("协议版本"));

        let missing = body(serde_json::json!({ "source": "anki", "words": [{ "term": "a" }] }));
        assert!(validate_payload(&missing).unwrap_err().contains("缺少协议版本"));
    }

    #[test]
    fn rejects_wrong_or_missing_source() {
        let wrong = body(serde_json::json!({ "v": 1, "source": "web", "words": [{ "term": "a" }] }));
        assert!(validate_payload(&wrong).unwrap_err().contains("source"));

        let missing = body(serde_json::json!({ "v": 1, "words": [{ "term": "a" }] }));
        assert!(validate_payload(&missing).unwrap_err().contains("缺少 source"));
    }

    #[test]
    fn rejects_empty_and_oversized_batches() {
        let empty = body(serde_json::json!({ "v": 1, "source": "anki", "words": [] }));
        assert!(validate_payload(&empty).unwrap_err().contains("没有单词"));

        let too_many: Vec<serde_json::Value> = (0..=MAX_ENTRIES)
            .map(|index| serde_json::json!({ "term": format!("word-{index}"), "meaning": "释义" }))
            .collect();
        let too_many = body(serde_json::json!({ "v": 1, "source": "anki", "words": too_many }));
        assert!(validate_payload(&too_many).unwrap_err().contains("最多推送 200"));
    }

    #[test]
    fn accepts_exactly_the_entry_limit() {
        let words: Vec<serde_json::Value> = (0..MAX_ENTRIES)
            .map(|index| serde_json::json!({ "term": format!("word-{index}"), "meaning": "释义" }))
            .collect();
        let payload = body(serde_json::json!({ "v": 1, "source": "anki", "words": words }));

        assert_eq!(validate_payload(&payload).unwrap().1, MAX_ENTRIES);
    }

    #[test]
    fn rejects_bad_entries() {
        let cases = [
            (serde_json::json!({ "v": 1, "source": "anki", "words": ["nope"] }), "不是 JSON 对象"),
            (serde_json::json!({ "v": 1, "source": "anki", "words": [{ "meaning": "x" }] }), "缺少 term"),
            (serde_json::json!({ "v": 1, "source": "anki", "words": [{ "term": "   " }] }), "是空的"),
            (
                serde_json::json!({ "v": 1, "source": "anki", "words": [{ "term": "a", "meaning": 1 }] }),
                "meaning 必须是字符串",
            ),
            (
                serde_json::json!({ "v": 1, "source": "anki", "words": [{ "term": "a", "capturedAt": 42 }] }),
                "capturedAt 必须是字符串",
            ),
        ];

        for (payload, expected) in cases {
            let error = validate_payload(&body(payload)).unwrap_err();
            assert!(error.contains(expected), "期望包含 {expected}，实际是 {error}");
        }
    }

    #[test]
    fn rejects_overlong_term_and_meaning() {
        let long_term = body(serde_json::json!({
            "v": 1, "source": "anki", "words": [{ "term": "a".repeat(MAX_TERM_CHARS + 1) }]
        }));
        assert!(validate_payload(&long_term).unwrap_err().contains("term 超过"));

        let long_meaning = body(serde_json::json!({
            "v": 1, "source": "anki", "words": [{ "term": "a", "meaning": "义".repeat(MAX_MEANING_CHARS + 1) }]
        }));
        assert!(validate_payload(&long_meaning)
            .unwrap_err()
            .contains("meaning 超过"));
    }

    #[test]
    fn rejects_oversized_body() {
        let oversized = vec![b' '; MAX_BODY_BYTES + 1];

        assert!(validate_payload(&oversized)
            .unwrap_err()
            .contains("512KB"));
    }

    async fn free_port() -> u16 {
        /* 绑到 0 → 系统分配一个空闲端口；返回后立即释放 */
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        listener.local_addr().unwrap().port()
    }

    #[tokio::test]
    async fn port_scan_skips_occupied_ports() {
        let occupied = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let busy = occupied.local_addr().unwrap().port();
        let spare = free_port().await;
        if busy == spare {
            return;
        }

        let (listener, found) = bind_first([busy, spare]).await.unwrap();

        assert_eq!(found, spare);
        assert_eq!(listener.local_addr().unwrap().port(), spare);
    }

    #[tokio::test]
    async fn port_scan_reports_when_range_is_full() {
        let occupied = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let busy = occupied.local_addr().unwrap().port();

        assert!(bind_first([busy]).await.is_err());
    }

    #[test]
    fn host_filter_accepts_loopback_only() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, HeaderValue::from_static("127.0.0.1:8770"));
        assert!(host_allowed(&headers));

        headers.insert(header::HOST, HeaderValue::from_static("localhost:8770"));
        assert!(host_allowed(&headers));

        headers.insert(
            header::HOST,
            HeaderValue::from_static("word-anchor.example.com"),
        );
        assert!(!host_allowed(&headers));

        assert!(!host_allowed(&HeaderMap::new()));
    }
}
