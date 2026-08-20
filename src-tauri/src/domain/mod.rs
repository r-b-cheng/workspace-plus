//! Product models shared by commands, services, and storage.
//!
//! Keep Windows/macOS identifiers out of these types.

mod app;
mod window;
mod workspace;

pub use app::InstalledApp;
pub use window::NativeWindow;
pub use workspace::Workspace;
