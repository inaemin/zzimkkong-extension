(() => {
  if (globalThis.__zzkRouteUtils) {
    return;
  }

  function isGuestReservationEditPage() {
    return /^\/guest\/[^/?#]+\/reservation\/edit\/?$/.test(location.pathname);
  }

  function isGuestSuccessPage() {
    return /^\/guest\/[^/?#]+\/success\/?$/.test(location.pathname);
  }

  function isGuestPage() {
    return /^\/guest\/[^/?#]+(?:\/reservation\/edit)?\/?$/.test(location.pathname);
  }

  function getSharingMapId() {
    const match = location.pathname.match(/^\/guest\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  globalThis.__zzkRouteUtils = {
    isGuestReservationEditPage,
    isGuestSuccessPage,
    isGuestPage,
    getSharingMapId,
  };
})();
