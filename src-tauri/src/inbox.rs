//! 收件箱：Anki 插件推来的 payload 先落成文件，前端再经 Tauri command 取走。
//!
//! 为什么不直接写数据库：Rust 侧用 axum，前端用 tauri-plugin-sql，两边各自持有
//! 一条 SQLite 连接。让 Rust 也去碰 `word-anchor.db` 就意味着两份 schema 与两套
//! 写入顺序，所以这里刻意只做「原子写一个 JSON 文件」这一件事，业务语义（去重、
//! 重排）全部留在前端的 `applyIntake`。

use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;

pub const INBOX_DIR: &str = "inbox";

/// 同一毫秒内的并发写入靠它错开文件名
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct InboxItem {
    /// 绝对路径，前端原样回传给 `inbox_remove`
    pub path: String,
    /// 文件内容，即 wire v1 的 JSON body
    pub payload: String,
}

pub fn inbox_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(INBOX_DIR)
}

/// 原子写入一条 payload，返回最终文件路径。
///
/// 先写同目录的 `.tmp-*` 并 `fsync`，再 `rename`：读到一半的 JSON 永远不会出现。
pub fn write_payload(dir: &Path, payload: &str) -> io::Result<PathBuf> {
    fs::create_dir_all(dir)?;

    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| io::Error::other("系统时间早于 1970 年，无法生成收件箱文件名"))?
        .as_millis();

    for _ in 0..MAX_NAME_ATTEMPTS {
        let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed) % 1000;
        let name = format!("{millis:013}-{sequence:03}.json");
        let target = dir.join(&name);
        if target.exists() {
            continue;
        }

        let temp = dir.join(format!(".tmp-{name}"));
        let write_result = (|| -> io::Result<()> {
            let mut file = fs::File::create(&temp)?;
            file.write_all(payload.as_bytes())?;
            file.sync_all()
        })();

        if let Err(error) = write_result {
            let _ = fs::remove_file(&temp);
            return Err(error);
        }

        if let Err(error) = fs::rename(&temp, &target) {
            let _ = fs::remove_file(&temp);
            return Err(error);
        }

        return Ok(target);
    }

    Err(io::Error::other("收件箱文件名分配失败"))
}

const MAX_NAME_ATTEMPTS: usize = 1000;

/// 按文件名（即时间戳）排序，保证前端按到达顺序收录。
pub fn list(dir: &Path) -> io::Result<Vec<InboxItem>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut rows: Vec<(String, InboxItem)> = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        /* 半成品临时文件不是收件箱内容 */
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if name.starts_with('.') || path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }

        let Ok(payload) = fs::read_to_string(&path) else {
            /* 读不出来就跳过：宁可少一条，也不要让整个收件箱卡死 */
            continue;
        };

        rows.push((
            name.to_owned(),
            InboxItem {
                path: path.to_string_lossy().into_owned(),
                payload,
            },
        ));
    }

    rows.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(rows.into_iter().map(|(_, item)| item).collect())
}

/// 只允许删除收件箱目录下的文件：前端传来的路径不可信。
pub fn remove(dir: &Path, path: &str) -> io::Result<()> {
    let dir = fs::canonicalize(dir)?;
    let target = fs::canonicalize(Path::new(path))?;

    if target.parent() != Some(dir.as_path()) || !target.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "只能删除收件箱里的文件",
        ));
    }

    fs::remove_file(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().expect("创建临时目录失败")
    }

    #[test]
    fn write_then_read_roundtrip() {
        let dir = temp_dir();
        let inbox = inbox_dir(dir.path());
        let payload = r#"{"v":1,"source":"anki","words":[{"term":"lucid","meaning":"清晰易懂的"}]}"#;

        let path = write_payload(&inbox, payload).expect("写入失败");

        assert_eq!(path.parent(), Some(inbox.as_path()));
        assert!(path.extension().and_then(|ext| ext.to_str()) == Some("json"));
        assert_eq!(fs::read_to_string(&path).unwrap(), payload);
    }

    #[test]
    fn write_is_atomic_and_leaves_no_temp_files() {
        let dir = temp_dir();
        let inbox = inbox_dir(dir.path());

        write_payload(&inbox, "{\"v\":1}").expect("写入失败");

        let names: Vec<String> = fs::read_dir(&inbox)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();

        assert_eq!(names.len(), 1, "只应留下一个成品文件：{names:?}");
        assert!(!names[0].starts_with(".tmp-"));
    }

    #[test]
    fn same_millisecond_writes_do_not_collide() {
        let dir = temp_dir();
        let inbox = inbox_dir(dir.path());

        let first = write_payload(&inbox, "{\"n\":1}").unwrap();
        let second = write_payload(&inbox, "{\"n\":2}").unwrap();

        assert_ne!(first, second);
        assert_eq!(list(&inbox).unwrap().len(), 2);
    }

    #[test]
    fn list_is_sorted_by_arrival_and_skips_noise() {
        let dir = temp_dir();
        let inbox = inbox_dir(dir.path());
        fs::create_dir_all(&inbox).unwrap();

        fs::write(inbox.join("0000000000002-000.json"), "{\"n\":2}").unwrap();
        fs::write(inbox.join("0000000000001-000.json"), "{\"n\":1}").unwrap();
        fs::write(inbox.join(".tmp-0000000000003-000.json"), "{\"n\":3}").unwrap();
        fs::write(inbox.join("notes.txt"), "not json").unwrap();

        let items = list(&inbox).unwrap();

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].payload, "{\"n\":1}");
        assert_eq!(items[1].payload, "{\"n\":2}");
    }

    #[test]
    fn list_of_missing_dir_is_empty() {
        let dir = temp_dir();

        assert!(list(&inbox_dir(dir.path())).unwrap().is_empty());
    }

    #[test]
    fn remove_deletes_only_inbox_files() {
        let dir = temp_dir();
        let inbox = inbox_dir(dir.path());
        let item = write_payload(&inbox, "{\"n\":1}").unwrap();
        let outside = dir.path().join("outside.json");
        fs::write(&outside, "{\"n\":2}").unwrap();

        assert!(remove(&inbox, &item.to_string_lossy()).is_ok());
        assert!(!item.exists());

        let denied = remove(&inbox, &outside.to_string_lossy());
        assert!(denied.is_err(), "收件箱以外的文件不能删");
        assert!(outside.exists());
    }
}
