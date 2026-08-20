//! Thin Tauri commands. Business rules belong in `services`.

pub mod apps;
pub mod windows;
pub mod workspaces;

pub use apps::{launch_app, scan_installed_apps};
pub use windows::{focus_window, list_windows};
pub use workspaces::list_workspaces;
