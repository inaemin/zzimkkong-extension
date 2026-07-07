(() => {
  if (globalThis.__zzkDebugConfig) {
    return;
  }

  const DEBUG_MODE = globalThis.__ZZK_DEBUG_MODE__ === true;

  globalThis.__zzkDebugConfig = {
    DEBUG_MODE,
    source: "globalThis.__ZZK_DEBUG_MODE__",
  };
})();
