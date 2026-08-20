/**
 * MOCK ONLY — 不是 Windows 置前证据。
 * 注入给浏览器的内存 command 后端，不连接真实 Tauri / 桌面。
 * 函数体必须能被 Playwright addInitScript 序列化，不能依赖外部闭包或 TS 类型语法。
 */
export function installE2eMockInvoke() {
  const isoNow = function () {
    return new Date().toISOString();
  };
  let seq = 1;
  const nextId = function (prefix) {
    seq += 1;
    return prefix + '-' + (seq - 1);
  };

  const installedApps = [
    {
      id: 'app-chrome',
      name: 'Chrome',
      source: 'startMenu',
      launchKind: 'shortcut',
      alreadyInWorkspace: false,
      category: '浏览器',
      isAvailable: true,
      platform: 'windows',
    },
    {
      id: 'app-code',
      name: 'VS Code',
      source: 'startMenu',
      launchKind: 'shortcut',
      alreadyInWorkspace: false,
      category: '编辑器',
      isAvailable: true,
      platform: 'windows',
    },
  ];

  const workspaces = [];
  const workspaceApps = [];
  const canvases = {};
  const assets = {};
  const appSettings = {
    quickSwitchShortcut: 'Control+KeyO',
    registrationStatus: 'registered',
    lastError: null,
  };
  const control = {
    failSaveCanvas: false,
    failNextFocus: false,
    closeNextWorkspaceApp: false,
    closeWorkspaceAppId: null,
    lastFocusWorkspaceAppId: null,
    lastLaunchInstalledAppId: null,
  };

  function fail(code, message) {
    throw { code: code, message: message };
  }

  function snapshotSettings() {
    return {
      quickSwitchShortcut: appSettings.quickSwitchShortcut,
      registrationStatus: appSettings.registrationStatus,
      lastError: appSettings.lastError,
    };
  }

  function normalizeShortcut(input) {
    const raw = input == null ? '' : String(input).trim();
    if (!raw) {
      return 'Control+KeyO';
    }
    const tokens = raw.split('+');
    const parts = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i].trim();
      if (!token) {
        fail('Validation', '快捷键格式无效，请使用例如 Control+KeyO');
      }
      parts.push(token);
    }
    if (parts.length < 2) {
      fail('Validation', '快捷键至少需要 Control、Alt 或 Meta 之一');
    }
    const key = parts[parts.length - 1];
    const mods = parts.slice(0, -1);
    let hasPrimaryMod = false;
    for (let i = 0; i < mods.length; i += 1) {
      const lower = mods[i].toLowerCase();
      if (
        lower === 'control' ||
        lower === 'ctrl' ||
        lower === 'alt' ||
        lower === 'meta' ||
        lower === 'command' ||
        lower === 'super'
      ) {
        hasPrimaryMod = true;
      }
    }
    if (!hasPrimaryMod) {
      fail('Validation', '快捷键至少需要 Control、Alt 或 Meta 之一');
    }
    if (!key || /^(control|ctrl|alt|meta|shift|command|super)$/i.test(key)) {
      fail('Validation', '快捷键缺少主键，请使用例如 Control+KeyO');
    }
    return parts.join('+');
  }

  function markWorkspaceAppClosed(app) {
    app.status = 'closed';
    app.windowTitle = undefined;
    app.errorMessage = '窗口已关闭，可以重新打开。';
  }

  function closeWorkspaceApp(id) {
    const app = workspaceApps.find(function (item) {
      return item.id === id;
    });
    if (app) {
      markWorkspaceAppClosed(app);
    }
  }

  function applyCloseControls() {
    if (control.closeWorkspaceAppId) {
      closeWorkspaceApp(control.closeWorkspaceAppId);
      control.closeWorkspaceAppId = null;
    }
    if (control.closeNextWorkspaceApp) {
      control.closeNextWorkspaceApp = false;
      if (workspaceApps.length > 0) {
        markWorkspaceAppClosed(workspaceApps[0]);
      }
    }
  }

  control.closeWorkspaceApp = closeWorkspaceApp;

  function withAlready(workspaceId) {
    return installedApps.map(function (app) {
      return Object.assign({}, app, {
        alreadyInWorkspace: workspaceApps.some(function (item) {
          return item.workspaceId === workspaceId && item.installedAppId === app.id;
        }),
      });
    });
  }

  function syncAppCount(workspaceId) {
    const workspace = workspaces.find(function (item) {
      return item.id === workspaceId;
    });
    if (workspace) {
      workspace.appCount = workspaceApps.filter(function (item) {
        return item.workspaceId === workspaceId;
      }).length;
      workspace.updatedAt = isoNow();
    }
  }

  function emptyCanvas(workspaceId) {
    return { workspaceId: workspaceId, nodes: [], edges: [], updatedAt: isoNow() };
  }

  async function invoke(command, args) {
    args = args || {};
    switch (command) {
      case 'list_workspaces':
        return workspaces.map(function (item) {
          return Object.assign({}, item);
        });
      case 'create_workspace': {
        const created = {
          id: nextId('ws'),
          name: String(args.name || ''),
          color: typeof args.color === 'string' ? args.color : undefined,
          appCount: 0,
          updatedAt: isoNow(),
          archived: false,
          isActive: true,
        };
        workspaces.forEach(function (workspace) {
          workspace.isActive = false;
        });
        workspaces.push(created);
        canvases[created.id] = emptyCanvas(created.id);
        return Object.assign({}, created);
      }
      case 'rename_workspace': {
        const workspace = workspaces.find(function (item) {
          return item.id === args.workspaceId;
        });
        if (!workspace) {
          fail('NotFound', '未找到该工作区或软件。');
        }
        workspace.name = String(args.name || workspace.name);
        workspace.updatedAt = isoNow();
        return Object.assign({}, workspace);
      }
      case 'delete_workspace': {
        const workspaceId = String(args.workspaceId || '');
        const index = workspaces.findIndex(function (item) {
          return item.id === workspaceId;
        });
        if (index < 0) {
          fail('NotFound', '未找到该工作区或软件。');
        }
        workspaces.splice(index, 1);
        for (let i = workspaceApps.length - 1; i >= 0; i -= 1) {
          if (workspaceApps[i].workspaceId === workspaceId) {
            workspaceApps.splice(i, 1);
          }
        }
        delete canvases[workspaceId];
        return { workspaceId: workspaceId, deleted: true };
      }
      case 'set_active_workspace': {
        const workspace = workspaces.find(function (item) {
          return item.id === args.workspaceId;
        });
        if (!workspace) {
          fail('NotFound', '未找到该工作区或软件。');
        }
        workspaces.forEach(function (item) {
          item.isActive = item.id === workspace.id;
        });
        workspace.lastOpenedAt = isoNow();
        workspace.updatedAt = isoNow();
        return Object.assign({}, workspace);
      }
      case 'list_workspace_apps':
        applyCloseControls();
        return workspaceApps
          .filter(function (item) {
            return item.workspaceId === args.workspaceId;
          })
          .map(function (item) {
            return Object.assign({}, item);
          });
      case 'list_installed_apps':
        return withAlready(typeof args.workspaceId === 'string' ? args.workspaceId : undefined);
      case 'search_installed_apps': {
        const query = String(args.query || '')
          .trim()
          .toLowerCase();
        return withAlready(typeof args.workspaceId === 'string' ? args.workspaceId : undefined).filter(function (app) {
          return !query || app.name.toLowerCase().indexOf(query) !== -1;
        });
      }
      case 'refresh_installed_apps':
        return withAlready(typeof args.workspaceId === 'string' ? args.workspaceId : undefined);
      case 'add_manual_app': {
        const path = String(args.path || '');
        if (!/\.(exe|lnk)$/i.test(path)) {
          fail('InvalidTarget', '路径无效或目标不存在。');
        }
        const added = {
          id: nextId('app'),
          name: (path.split(/[/\\]/).pop() || '手动软件').replace(/\.(exe|lnk)$/i, ''),
          source: 'manualPath',
          launchKind: path.toLowerCase().endsWith('.lnk') ? 'shortcut' : 'exe',
          alreadyInWorkspace: false,
          isAvailable: true,
          platform: 'windows',
        };
        installedApps.push(added);
        return Object.assign({}, added);
      }
      case 'launch_workspace_app': {
        const workspaceId = String(args.workspaceId || '');
        const installedAppId = String(args.installedAppId || '');
        const installed = installedApps.find(function (item) {
          return item.id === installedAppId;
        });
        if (!installed) {
          fail('NotFound', '未找到该工作区或软件。');
        }
        const existing = workspaceApps.find(function (item) {
          return item.workspaceId === workspaceId && item.installedAppId === installedAppId;
        });
        control.lastLaunchInstalledAppId = installedAppId;
        if (existing) {
          existing.status = 'running';
          existing.windowTitle = installed.name;
          existing.nativeWindowId = existing.nativeWindowId || 'mock:' + existing.id;
          existing.lastLaunchedAt = isoNow();
          existing.errorMessage = undefined;
          return Object.assign({}, existing);
        }
        const created = {
          id: nextId('wa'),
          workspaceId: workspaceId,
          installedAppId: installedAppId,
          name: installed.name,
          status: 'running',
          windowTitle: installed.name,
          nativeWindowId: 'mock:' + seq,
          lastLaunchedAt: isoNow(),
        };
        workspaceApps.push(created);
        syncAppCount(workspaceId);
        return Object.assign({}, created);
      }
      case 'focus_workspace_app': {
        const app = workspaceApps.find(function (item) {
          return item.id === args.workspaceAppId;
        });
        if (!app) {
          fail('NotFound', '未找到该工作区或软件。');
        }
        if (control.failNextFocus) {
          control.failNextFocus = false;
          app.status = 'closed';
          app.windowTitle = undefined;
          app.errorMessage = '窗口已关闭，可以重新打开。';
          fail('WindowClosed', '窗口已关闭，可以重新打开。');
        }
        if (app.status === 'closed') {
          fail('WindowClosed', '窗口已关闭，可以重新打开。');
        }
        app.status = 'running';
        app.lastFocusedAt = isoNow();
        control.lastFocusWorkspaceAppId = app.id;
        return Object.assign({}, app);
      }
      case 'get_app_settings':
        return snapshotSettings();
      case 'update_app_settings': {
        const normalized = normalizeShortcut(args.quickSwitchShortcut);
        appSettings.quickSwitchShortcut = normalized;
        if (/conflict/i.test(normalized)) {
          appSettings.registrationStatus = 'conflict';
          appSettings.lastError = '快捷键与其他软件冲突（E2E mock）';
        } else {
          appSettings.registrationStatus = 'registered';
          appSettings.lastError = null;
        }
        return snapshotSettings();
      }
      case 'remove_workspace_app': {
        const index = workspaceApps.findIndex(function (item) {
          return item.id === args.workspaceAppId;
        });
        if (index < 0) {
          fail('NotFound', '未找到该工作区或软件。');
        }
        const removed = workspaceApps.splice(index, 1)[0];
        if (removed) {
          syncAppCount(removed.workspaceId);
        }
        return { workspaceAppId: args.workspaceAppId, removed: true };
      }
      case 'get_canvas': {
        const workspaceId = String(args.workspaceId || '');
        return Object.assign({}, canvases[workspaceId] || emptyCanvas(workspaceId));
      }
      case 'save_canvas': {
        if (control.failSaveCanvas) {
          fail('Internal', '保存失败（E2E mock）');
        }
        const workspaceId = String(args.workspaceId || '');
        const rawNodes = Array.isArray(args.nodes) ? args.nodes : [];
        const nodes = rawNodes.map(function (node) {
          return {
            id: String(node.id || nextId('node')),
            workspaceId: workspaceId,
            nodeType: String(node.nodeType || 'markdown'),
            title: typeof node.title === 'string' ? node.title : undefined,
            contentMarkdown: typeof node.contentMarkdown === 'string' ? node.contentMarkdown : undefined,
            contentText: typeof node.contentText === 'string' ? node.contentText : undefined,
            assetId: typeof node.assetId === 'string' ? node.assetId : undefined,
            x: Number(node.x || 0),
            y: Number(node.y || 0),
            width: typeof node.width === 'number' ? node.width : undefined,
            height: typeof node.height === 'number' ? node.height : undefined,
            color: typeof node.color === 'string' ? node.color : undefined,
            metadataJson: typeof node.metadataJson === 'string' ? node.metadataJson : undefined,
            zIndex: typeof node.zIndex === 'number' ? node.zIndex : 0,
            createdAt: isoNow(),
            updatedAt: isoNow(),
          };
        });
        const saved = {
          workspaceId: workspaceId,
          nodes: nodes,
          edges: Array.isArray(args.edges) ? args.edges : [],
          updatedAt: isoNow(),
        };
        canvases[workspaceId] = saved;
        return {
          workspaceId: saved.workspaceId,
          nodes: saved.nodes.map(function (node) {
            return Object.assign({}, node);
          }),
          edges: saved.edges,
          updatedAt: saved.updatedAt,
        };
      }
      case 'upsert_canvas_node': {
        const workspaceId = String(args.workspaceId || '');
        const node = args.node || {};
        const canvas = canvases[workspaceId] || emptyCanvas(workspaceId);
        const next = {
          id: String(node.id || nextId('node')),
          workspaceId: workspaceId,
          nodeType: String(node.nodeType || 'markdown'),
          title: typeof node.title === 'string' ? node.title : undefined,
          contentMarkdown: typeof node.contentMarkdown === 'string' ? node.contentMarkdown : undefined,
          x: Number(node.x || 0),
          y: Number(node.y || 0),
          zIndex: typeof node.zIndex === 'number' ? node.zIndex : 0,
          createdAt: isoNow(),
          updatedAt: isoNow(),
        };
        const index = canvas.nodes.findIndex(function (item) {
          return item.id === next.id;
        });
        if (index >= 0) {
          canvas.nodes[index] = next;
        } else {
          canvas.nodes.push(next);
        }
        canvas.updatedAt = isoNow();
        canvases[workspaceId] = canvas;
        return Object.assign({}, next);
      }
      case 'delete_canvas_node': {
        const workspaceId = String(args.workspaceId || '');
        const canvas = canvases[workspaceId];
        if (canvas) {
          canvas.nodes = canvas.nodes.filter(function (item) {
            return item.id !== args.nodeId;
          });
        }
        return undefined;
      }
      case 'save_canvas_asset': {
        const assetId = nextId('asset');
        const mimeType = typeof args.mimeType === 'string' ? args.mimeType : 'image/png';
        const fileName = typeof args.fileName === 'string' ? args.fileName : 'image.png';
        assets[assetId] = {
          id: assetId,
          mimeType: mimeType,
          fileName: fileName,
          contentBase64: String(args.contentBase64 || ''),
          storagePath: 'assets/' + fileName,
          source: typeof args.source === 'string' ? args.source : 'drag_drop',
        };
        return {
          id: assetId,
          assetType: 'image',
          mimeType: mimeType,
          fileName: fileName,
          storagePath: 'assets/' + fileName,
          source: assets[assetId].source,
          createdAt: isoNow(),
        };
      }
      case 'read_canvas_asset': {
        const asset = assets[String(args.assetId || '')];
        if (!asset) {
          fail('NotFound', '图片缺失或无法加载');
        }
        return {
          assetId: asset.id,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
          contentBase64: asset.contentBase64,
          dataUrl: 'data:' + (asset.mimeType || 'image/png') + ';base64,' + asset.contentBase64,
        };
      }
      default:
        fail('Internal', '未知 command: ' + command);
    }
  }

  window.__E2E_MOCK_CONTROL__ = control;
  window.__E2E_MOCK_INVOKE__ = invoke;
  window.__TAURI_INVOKE_MOCK__ = invoke;
}
