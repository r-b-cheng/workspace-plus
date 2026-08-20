use tauri::State;

use crate::domain::{Asset, Canvas, CanvasEdgeInput, CanvasNode, CanvasNodeInput};
use crate::errors::AppError;
use crate::services::AppService;

#[tauri::command(rename_all = "camelCase")]
pub fn get_canvas(state: State<AppService>, workspace_id: String) -> Result<Canvas, AppError> {
    if workspace_id.trim().is_empty() {
        return Err(AppError::validation("workspaceId is required"));
    }
    state.get_canvas(&workspace_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_canvas(
    state: State<AppService>,
    workspace_id: String,
    nodes: Vec<CanvasNodeInput>,
    edges: Vec<CanvasEdgeInput>,
) -> Result<Canvas, AppError> {
    if workspace_id.trim().is_empty() {
        return Err(AppError::validation("workspaceId is required"));
    }
    state.save_canvas(&workspace_id, nodes, edges)
}

#[tauri::command(rename_all = "camelCase")]
pub fn upsert_canvas_node(
    state: State<AppService>,
    workspace_id: String,
    node: CanvasNodeInput,
) -> Result<CanvasNode, AppError> {
    if workspace_id.trim().is_empty() {
        return Err(AppError::validation("workspaceId is required"));
    }
    state.upsert_canvas_node(&workspace_id, node)
}

#[tauri::command(rename_all = "camelCase")]
pub fn delete_canvas_node(
    state: State<AppService>,
    workspace_id: String,
    node_id: String,
) -> Result<(), AppError> {
    if workspace_id.trim().is_empty() {
        return Err(AppError::validation("workspaceId is required"));
    }
    if node_id.trim().is_empty() {
        return Err(AppError::validation("nodeId is required"));
    }
    state.delete_canvas_node(&workspace_id, &node_id)
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_canvas_asset(
    state: State<AppService>,
    file_name: String,
    content_base64: String,
    mime_type: Option<String>,
    source: Option<String>,
    workspace_id: Option<String>,
) -> Result<Asset, AppError> {
    if let Some(workspace_id) = workspace_id.as_deref() {
        if !workspace_id.trim().is_empty() {
            state.get_canvas(workspace_id)?;
        }
    }
    state.save_canvas_asset(
        &file_name,
        &content_base64,
        mime_type.as_deref(),
        source.as_deref(),
    )
}
