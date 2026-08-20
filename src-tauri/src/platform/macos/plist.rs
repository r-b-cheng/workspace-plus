//! XML Info.plist reader. Binary plists are skipped so a scan can continue.

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BundleInfo {
    pub display_name: Option<String>,
    pub bundle_name: Option<String>,
    pub executable: Option<String>,
    pub version: Option<String>,
    pub identifier: Option<String>,
}

impl BundleInfo {
    pub fn resolved_display_name(&self, fallback: &str) -> String {
        self.display_name
            .as_deref()
            .or(self.bundle_name.as_deref())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(fallback)
            .to_string()
    }
}

pub fn is_binary_plist(bytes: &[u8]) -> bool {
    bytes.starts_with(b"bplist")
}

pub fn parse_info_plist_xml(xml: &str) -> BundleInfo {
    BundleInfo {
        display_name: plist_string_for_key(xml, "CFBundleDisplayName"),
        bundle_name: plist_string_for_key(xml, "CFBundleName"),
        executable: plist_string_for_key(xml, "CFBundleExecutable"),
        version: plist_string_for_key(xml, "CFBundleShortVersionString"),
        identifier: plist_string_for_key(xml, "CFBundleIdentifier"),
    }
}

pub fn parse_info_plist_bytes(bytes: &[u8]) -> Option<BundleInfo> {
    if is_binary_plist(bytes) {
        return None;
    }
    let xml = String::from_utf8_lossy(bytes);
    Some(parse_info_plist_xml(&xml))
}

fn plist_string_for_key(xml: &str, key: &str) -> Option<String> {
    let key_tag = format!("<key>{key}</key>");
    let rest = xml.split(&key_tag).nth(1)?.trim_start();
    let inner = rest.strip_prefix("<string>")?;
    let value = inner.split("</string>").next()?;
    let decoded = decode_xml_text(value);
    if decoded.is_empty() {
        None
    } else {
        Some(decoded)
    }
}

fn decode_xml_text(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const CHROME_PLIST: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>Google Chrome</string>
	<key>CFBundleExecutable</key>
	<string>Google Chrome</string>
	<key>CFBundleIdentifier</key>
	<string>com.google.Chrome</string>
	<key>CFBundleName</key>
	<string>Chrome</string>
	<key>CFBundleShortVersionString</key>
	<string>120.0.1</string>
</dict>
</plist>
"#;

    #[test]
    fn reads_display_name_and_executable_from_xml_plist() {
        let info = parse_info_plist_xml(CHROME_PLIST);
        assert_eq!(info.display_name.as_deref(), Some("Google Chrome"));
        assert_eq!(info.bundle_name.as_deref(), Some("Chrome"));
        assert_eq!(info.executable.as_deref(), Some("Google Chrome"));
        assert_eq!(info.version.as_deref(), Some("120.0.1"));
        assert_eq!(info.resolved_display_name("Fallback"), "Google Chrome");
    }

    #[test]
    fn falls_back_to_bundle_name_when_display_name_missing() {
        let info = parse_info_plist_xml(
            r#"<dict><key>CFBundleName</key><string>TextEdit</string></dict>"#,
        );
        assert_eq!(info.resolved_display_name("TextEdit.app"), "TextEdit");
    }

    #[test]
    fn skips_binary_plist_bytes() {
        assert!(parse_info_plist_bytes(b"bplist00\x00not-xml").is_none());
        assert!(is_binary_plist(b"bplist00"));
    }
}
