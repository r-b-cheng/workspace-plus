//! Product models shared by commands, services, and storage.
//!
//! Keep Windows/macOS identifiers out of these types. Native window ids are
//! opaque strings.

mod app;
mod asset;
mod canvas;
mod window;
mod workspace;

pub use app::{
    app_type_to_launch_kind, installed_app_source_to_dto, workspace_app_status_to_dto, InstalledApp,
    RemoveWorkspaceAppResult, WorkspaceApp,
};
pub use asset::{Asset, CanvasAssetContent};
pub use canvas::{Canvas, CanvasEdge, CanvasEdgeInput, CanvasNode, CanvasNodeInput};
pub use window::{NativeWindow, NativeWindowId};
pub use workspace::{DeleteWorkspaceResult, Workspace};
