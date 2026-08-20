use crate::domain::settings::DEFAULT_QUICK_SWITCH_SHORTCUT;
use crate::errors::AppError;

const MOD_CONTROL: &str = "Control";
const MOD_ALT: &str = "Alt";
const MOD_META: &str = "Meta";
const MOD_SHIFT: &str = "Shift";

/// Normalizes a user-entered shortcut into KeyboardEvent.code style.
///
/// Empty or whitespace-only input falls back to `Control+KeyO`.
/// `Ctrl` / `Command` / `Super` are accepted as aliases.
pub fn normalize_shortcut(input: Option<&str>) -> Result<String, AppError> {
    let raw = input.unwrap_or("").trim();
    if raw.is_empty() {
        return Ok(DEFAULT_QUICK_SWITCH_SHORTCUT.to_string());
    }

    let mut has_control = false;
    let mut has_alt = false;
    let mut has_meta = false;
    let mut has_shift = false;
    let mut key: Option<String> = None;

    for part in raw.split('+') {
        let token = part.trim();
        if token.is_empty() {
            return Err(AppError::validation("快捷键格式无效，请使用例如 Control+KeyO"));
        }
        match normalize_token(token)? {
            ShortcutToken::Control => has_control = true,
            ShortcutToken::Alt => has_alt = true,
            ShortcutToken::Meta => has_meta = true,
            ShortcutToken::Shift => has_shift = true,
            ShortcutToken::Key(parsed) => {
                if key.is_some() {
                    return Err(AppError::validation("快捷键只能包含一个主键"));
                }
                key = Some(parsed);
            }
        }
    }

    if !has_control && !has_alt && !has_meta {
        return Err(AppError::validation(
            "快捷键至少需要 Control、Alt 或 Meta 之一",
        ));
    }
    let Some(key) = key else {
        return Err(AppError::validation("快捷键缺少主键，请使用例如 Control+KeyO"));
    };

    let mut parts = Vec::new();
    if has_control {
        parts.push(MOD_CONTROL.to_string());
    }
    if has_alt {
        parts.push(MOD_ALT.to_string());
    }
    if has_meta {
        parts.push(MOD_META.to_string());
    }
    if has_shift {
        parts.push(MOD_SHIFT.to_string());
    }
    parts.push(key);
    Ok(parts.join("+"))
}

/// Converts a normalized `Control+KeyO` shortcut into a plugin accelerator like `Ctrl+O`.
pub fn to_plugin_accelerator(normalized: &str) -> Result<String, AppError> {
    let normalized = normalize_shortcut(Some(normalized))?;
    let mut mods = Vec::new();
    let mut key = None;
    for token in normalized.split('+') {
        match token {
            MOD_CONTROL => mods.push("Ctrl"),
            MOD_ALT => mods.push("Alt"),
            MOD_META => mods.push("Super"),
            MOD_SHIFT => mods.push("Shift"),
            other => key = Some(code_to_plugin_key(other)?),
        }
    }
    let key = key.ok_or_else(|| AppError::validation("快捷键缺少主键"))?;
    mods.push(key.as_str());
    Ok(mods.join("+"))
}

pub fn classify_registration_error(message: &str) -> (&'static str, String) {
    let lower = message.to_lowercase();
    if lower.contains("already")
        || lower.contains("conflict")
        || lower.contains("in use")
        || lower.contains("occupied")
        || lower.contains("already registered")
    {
        (
            crate::domain::settings::REGISTRATION_CONFLICT,
            format!("快捷键冲突：该组合可能已被其他程序占用。{message}"),
        )
    } else if lower.contains("denied")
        || lower.contains("permission")
        || lower.contains("access")
        || lower.contains("refused")
        || lower.contains("not allowed")
    {
        (
            crate::domain::settings::REGISTRATION_DENIED,
            format!("系统拒绝注册该快捷键。{message}"),
        )
    } else {
        (
            crate::domain::settings::REGISTRATION_DENIED,
            format!("无法注册快捷键。{message}"),
        )
    }
}

enum ShortcutToken {
    Control,
    Alt,
    Meta,
    Shift,
    Key(String),
}

fn normalize_token(token: &str) -> Result<ShortcutToken, AppError> {
    match token.to_ascii_lowercase().as_str() {
        "control" | "ctrl" => Ok(ShortcutToken::Control),
        "alt" | "option" => Ok(ShortcutToken::Alt),
        "meta" | "command" | "super" | "cmd" | "win" => Ok(ShortcutToken::Meta),
        "shift" => Ok(ShortcutToken::Shift),
        _ => Ok(ShortcutToken::Key(normalize_key(token)?)),
    }
}

fn normalize_key(token: &str) -> Result<String, AppError> {
    let folded = token.to_ascii_lowercase();

    if folded.len() == 1 {
        let ch = folded.chars().next().unwrap();
        if ch.is_ascii_alphabetic() {
            return Ok(format!("Key{}", ch.to_ascii_uppercase()));
        }
        if ch.is_ascii_digit() {
            return Ok(format!("Digit{ch}"));
        }
    }

    if let Some(letter) = folded.strip_prefix("key") {
        if letter.len() == 1 {
            let ch = letter.chars().next().unwrap();
            if ch.is_ascii_alphabetic() {
                return Ok(format!("Key{}", ch.to_ascii_uppercase()));
            }
        }
    }

    if let Some(digit) = folded.strip_prefix("digit") {
        if digit.len() == 1 && digit.chars().next().unwrap().is_ascii_digit() {
            return Ok(format!("Digit{digit}"));
        }
    }

    if let Some(num) = folded.strip_prefix('f') {
        if let Ok(index) = num.parse::<u8>() {
            if (1..=12).contains(&index) {
                return Ok(format!("F{index}"));
            }
        }
    }

    match folded.as_str() {
        "space" => return Ok("Space".to_string()),
        "escape" | "esc" => return Ok("Escape".to_string()),
        "enter" | "return" => return Ok("Enter".to_string()),
        "tab" => return Ok("Tab".to_string()),
        "backspace" => return Ok("Backspace".to_string()),
        "delete" | "del" => return Ok("Delete".to_string()),
        "arrowup" | "up" => return Ok("ArrowUp".to_string()),
        "arrowdown" | "down" => return Ok("ArrowDown".to_string()),
        "arrowleft" | "left" => return Ok("ArrowLeft".to_string()),
        "arrowright" | "right" => return Ok("ArrowRight".to_string()),
        _ => {}
    }

    Err(AppError::validation(format!(
        "不支持的快捷键主键：{token}"
    )))
}

fn code_to_plugin_key(code: &str) -> Result<String, AppError> {
    if let Some(letter) = code.strip_prefix("Key") {
        if letter.len() == 1 {
            return Ok(letter.to_string());
        }
    }
    if let Some(digit) = code.strip_prefix("Digit") {
        if digit.len() == 1 {
            return Ok(digit.to_string());
        }
    }
    if code.starts_with('F') && code[1..].parse::<u8>().ok().is_some_and(|n| (1..=12).contains(&n)) {
        return Ok(code.to_string());
    }
    match code {
        "Space" => Ok("Space".to_string()),
        "Escape" => Ok("Esc".to_string()),
        "Enter" => Ok("Enter".to_string()),
        "Tab" => Ok("Tab".to_string()),
        "Backspace" => Ok("Backspace".to_string()),
        "Delete" => Ok("Delete".to_string()),
        "ArrowUp" => Ok("Up".to_string()),
        "ArrowDown" => Ok("Down".to_string()),
        "ArrowLeft" => Ok("Left".to_string()),
        "ArrowRight" => Ok("Right".to_string()),
        _ => Err(AppError::validation(format!(
            "无法转换快捷键主键：{code}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_falls_back_to_default() {
        assert_eq!(normalize_shortcut(None).unwrap(), "Control+KeyO");
        assert_eq!(normalize_shortcut(Some("")).unwrap(), "Control+KeyO");
        assert_eq!(normalize_shortcut(Some("   ")).unwrap(), "Control+KeyO");
    }

    #[test]
    fn accepts_aliases_and_canonicalizes() {
        assert_eq!(normalize_shortcut(Some("ctrl+o")).unwrap(), "Control+KeyO");
        assert_eq!(
            normalize_shortcut(Some("Control+Shift+KeyP")).unwrap(),
            "Control+Shift+KeyP"
        );
        assert_eq!(
            normalize_shortcut(Some("Ctrl+Shift+P")).unwrap(),
            "Control+Shift+KeyP"
        );
        assert_eq!(normalize_shortcut(Some("Alt+KeyK")).unwrap(), "Alt+KeyK");
        assert_eq!(
            normalize_shortcut(Some("Command+Digit1")).unwrap(),
            "Meta+Digit1"
        );
        assert_eq!(normalize_shortcut(Some("Super+F5")).unwrap(), "Meta+F5");
    }

    #[test]
    fn rejects_invalid_shortcuts() {
        for input in ["O", "Control+", "not-a-shortcut", "Shift+KeyO"] {
            let err = normalize_shortcut(Some(input)).unwrap_err();
            assert_eq!(err.code, crate::errors::codes::VALIDATION, "{input}");
        }
    }

    #[test]
    fn converts_to_plugin_accelerator() {
        assert_eq!(to_plugin_accelerator("Control+KeyO").unwrap(), "Ctrl+O");
        assert_eq!(
            to_plugin_accelerator("Control+Shift+KeyP").unwrap(),
            "Ctrl+Shift+P"
        );
        assert_eq!(to_plugin_accelerator("Alt+KeyK").unwrap(), "Alt+K");
        assert_eq!(to_plugin_accelerator("Meta+Digit1").unwrap(), "Super+1");
    }
}
