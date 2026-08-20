//! Thin Tauri commands. Business rules belong in `services`.

pub mod apps;
pub mod canvas;
pub mod workspaces;

pub use apps::{
    add_manual_app, focus_workspace_app, launch_workspace_app, list_installed_apps,
    list_workspace_apps, refresh_installed_apps, remove_workspace_app, search_installed_apps,
};
pub use canvas::{
    delete_canvas_node, get_canvas, read_canvas_asset, save_canvas, save_canvas_asset,
    upsert_canvas_node,
};
pub use workspaces::{
    create_workspace, delete_workspace, list_workspaces, rename_workspace, set_active_workspace,
};
