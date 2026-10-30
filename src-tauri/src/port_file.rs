//! 端口发现文件：`<系统配置目录>/word-anchor/port`。
//!
//! 插件按「配置的 api_base → 这个文件 → 8770」的顺序发现端口，所以文件里只写
//! 一个纯文本端口号。路径刻意不用 Tauri 的 identifier，避免改包名后插件失联
//! （Windows 上是 `%APPDATA%\word-anchor\port`）。

use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

use crate::api::{PORT_MAX, PORT_MIN};

pub const APP_DIR: &str = "word-anchor";
pub const FILE_NAME: &str = "port";

pub fn default_path() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join(APP_DIR).join(FILE_NAME))
}

pub fn write(port: u16) -> io::Result<()> {
    let path = default_path()
        .ok_or_else(|| io::Error::other("找不到系统配置目录，无法写端口文件"))?;
    write_to(&path, port)
}

/// 原子写：先写 `.port.tmp` 再 rename，插件永远读不到半个数字。
pub fn write_to(path: &Path, port: u16) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let temp = path.with_extension("tmp");
    let result = (|| -> io::Result<()> {
        let mut file = fs::File::create(&temp)?;
        file.write_all(port.to_string().as_bytes())?;
        file.sync_all()
    })();

    if let Err(error) = result {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }

    fs::rename(&temp, path)
}

/// 退出时尽力清理：只删「内容确实是词锚端口」的那个文件。
pub fn clear() {
    if let Some(path) = default_path() {
        clear_at(&path);
    }
}

pub fn clear_at(path: &Path) {
    let ours = fs::read_to_string(path)
        .ok()
        .and_then(|text| text.trim().parse::<u16>().ok())
        .is_some_and(|port| (PORT_MIN..=PORT_MAX).contains(&port));

    if ours {
        let _ = fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_then_clear() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("word-anchor").join("port");

        write_to(&path, 8771).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "8771");
        assert!(!path.with_extension("tmp").exists());

        clear_at(&path);
        assert!(!path.exists());
    }

    #[test]
    fn clear_leaves_foreign_files_alone() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("port");

        fs::write(&path, "not-a-port").unwrap();
        clear_at(&path);
        assert!(path.exists());

        fs::write(&path, "1234").unwrap();
        clear_at(&path);
        assert!(path.exists(), "不在 8770..=8789 的端口不是词锚写的");
    }
}
