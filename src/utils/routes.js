(() => {
  if (globalThis.__zzkRouteUtils) {
    return;
  }

  const SERVICE_LEGACY = "legacy";
  const SERVICE_LMS = "lms";

  const LEGACY_HOST = "zzimkkong.com";
  const LMS_HOST = "techcourse-lms-plus-web.woowahan.com";

  function normalizeHost(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  }

  // 개편 서비스(techcourse-lms-plus-web)와 legacy 찜꽁(zzimkkong.com)이 동시에 운영 중이라
  // 호스트로 어느 쪽 API를 쓸지 고른다. 판별 불가한 호스트는 legacy로 취급한다.
  function getServiceKindForHost(hostValue) {
    const host = normalizeHost(hostValue);
    if (host === LMS_HOST || host.endsWith(`.${LMS_HOST}`)) {
      return SERVICE_LMS;
    }
    return SERVICE_LEGACY;
  }

  function getServiceKind() {
    return getServiceKindForHost(location.hostname);
  }

  function isLmsService() {
    return getServiceKind() === SERVICE_LMS;
  }

  function isLegacyService() {
    return getServiceKind() === SERVICE_LEGACY;
  }

  function isLmsSpaceReservationPage() {
    return isLmsService() && /^\/space-reservations(?:\/.*)?$/.test(location.pathname);
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

  // 개편 서비스에는 공유 맵 개념이 없어 sharingMapId가 없다. 대신 레이더가 스코프
  // 키를 만들 때 쓸 수 있도록 고정 토큰을 돌려준다.
  const LMS_SCOPE_ID = "lms";

  function getSharingMapId() {
    if (isLmsService()) {
      return isLmsSpaceReservationPage() ? LMS_SCOPE_ID : null;
    }
    const match = location.pathname.match(/^\/guest\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  // 레이더를 띄울 수 있는 페이지인지. legacy는 게스트 페이지, 개편 서비스는 예약 페이지.
  function isRadarSupportedPage() {
    return isLmsService() ? isLmsSpaceReservationPage() : isGuestPage();
  }

  globalThis.__zzkRouteUtils = {
    SERVICE_LEGACY,
    SERVICE_LMS,
    LEGACY_HOST,
    LMS_HOST,
    LMS_SCOPE_ID,
    getServiceKind,
    getServiceKindForHost,
    isLmsService,
    isLegacyService,
    isLmsSpaceReservationPage,
    isRadarSupportedPage,
    isGuestReservationEditPage,
    isGuestSuccessPage,
    isGuestPage,
    getSharingMapId,
  };
})();
