/* eslint-disable no-console */
(function () {
  var WS_PATH = "/ws/system-refresh";
  var HEARTBEAT_INTERVAL_MS = 25000;
  var HEARTBEAT_TIMEOUT_MS = 75000;
  var RECONNECT_BASE_DELAY_MS = 1000;
  var RECONNECT_MAX_DELAY_MS = 15000;
  var WORKSPACE_STORAGE_KEY = "creative-spark-active-workspace";

  var socket = null;
  var reconnectTimer = null;
  var heartbeatTimer = null;
  var reconnectAttempts = 0;
  var lastPongAt = 0;
  var intentionallyClosed = false;

  function normalizeString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function clearTimers() {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function resolveWorkspaceId() {
    var workspaceId = normalizeString(window.localStorage.getItem(WORKSPACE_STORAGE_KEY));
    return workspaceId || "main";
  }

  function resolveBackendBaseUrl() {
    var configuredBase = normalizeString(window.__CAMPAIGN_API_BASE_URL__);
    if (configuredBase && configuredBase.indexOf("%VITE_") !== 0) {
      return configuredBase.replace(/\/+$/, "");
    }

    var locationInfo = window.location;
    var isLocalDevPort =
      locationInfo.port === "8080" ||
      locationInfo.port === "8081" ||
      locationInfo.port === "5173" ||
      locationInfo.port === "4173";

    if (isLocalDevPort) {
      var devHost =
        locationInfo.hostname === "localhost" || locationInfo.hostname === "127.0.0.1"
          ? "127.0.0.1"
          : locationInfo.hostname;
      return locationInfo.protocol + "//" + devHost + ":8787";
    }

    return locationInfo.origin;
  }

  function resolveWebSocketUrl() {
    var baseUrl = resolveBackendBaseUrl();
    var parsed = new URL(baseUrl);
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    parsed.pathname = WS_PATH;
    parsed.search = "";
    parsed.searchParams.set("workspaceId", resolveWorkspaceId());

    var authToken = normalizeString(window.__BACKEND_AUTH_TOKEN__);
    if (authToken && authToken.indexOf("%VITE_") !== 0) {
      parsed.searchParams.set("token", authToken);
    }

    return parsed.toString();
  }

  function scheduleReconnect() {
    if (intentionallyClosed || reconnectTimer) {
      return;
    }

    var delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts));
    reconnectAttempts += 1;

    reconnectTimer = window.setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  function startHeartbeat() {
    if (heartbeatTimer) {
      window.clearInterval(heartbeatTimer);
    }

    heartbeatTimer = window.setInterval(function () {
      if (!socket || socket.readyState !== window.WebSocket.OPEN) {
        return;
      }

      if (Date.now() - lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        try {
          socket.close(4000, "Heartbeat timeout");
        } catch (_error) {
          // no-op
        }
        return;
      }

      try {
        socket.send(
          JSON.stringify({
            type: "PING",
            timestamp: new Date().toISOString(),
          }),
        );
      } catch (_error) {
        // no-op
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  function handleIncomingMessage(raw) {
    if (!raw) {
      return;
    }

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      return;
    }

    if (!parsed || typeof parsed !== "object") {
      return;
    }

    var type = normalizeString(parsed.type).toUpperCase();
    if (!type) {
      return;
    }

    if (type === "CONNECTED" || type === "PONG") {
      lastPongAt = Date.now();
      return;
    }

    if (type === "PING") {
      lastPongAt = Date.now();
      if (socket && socket.readyState === window.WebSocket.OPEN) {
        try {
          socket.send(
            JSON.stringify({
              type: "PONG",
              timestamp: new Date().toISOString(),
            }),
          );
        } catch (_error) {
          // no-op
        }
      }
      return;
    }

    if (type === "REFRESH_SIGNAL") {
      var delayMs = Number(parsed.delayMs);
      var safeDelay = Number.isFinite(delayMs) ? Math.max(0, Math.min(10000, Math.round(delayMs))) : 0;
      window.setTimeout(function () {
        window.location.reload();
      }, safeDelay);
    }
  }

  function connect() {
    clearTimers();

    var wsUrl = resolveWebSocketUrl();
    try {
      socket = new window.WebSocket(wsUrl);
    } catch (_error) {
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", function () {
      reconnectAttempts = 0;
      lastPongAt = Date.now();
      startHeartbeat();
    });

    socket.addEventListener("message", function (event) {
      handleIncomingMessage(event.data);
    });

    socket.addEventListener("error", function () {
      try {
        if (socket && socket.readyState === window.WebSocket.OPEN) {
          socket.close();
        }
      } catch (_error) {
        // no-op
      }
    });

    socket.addEventListener("close", function () {
      clearTimers();
      scheduleReconnect();
    });
  }

  window.addEventListener("storage", function (event) {
    if (event.key !== WORKSPACE_STORAGE_KEY) {
      return;
    }
    if (socket && socket.readyState === window.WebSocket.OPEN) {
      try {
        socket.close(1000, "Workspace changed");
      } catch (_error) {
        // no-op
      }
    }
  });

  window.addEventListener("beforeunload", function () {
    intentionallyClosed = true;
    clearTimers();
    if (socket && socket.readyState === window.WebSocket.OPEN) {
      try {
        socket.close(1000, "Page unloading");
      } catch (_error) {
        // no-op
      }
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      function () {
        connect();
      },
      { once: true },
    );
  } else {
    connect();
  }
})();

