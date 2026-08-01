export const LMS_HOST = "techcourse-lms-plus-web.woowahan.com";

export function isLmsSpaceReservationPage() {
  return /^\/space-reservations(?:\/.*)?$/.test(location.pathname);
}

// lms+ 에는 공유 맵 개념이 없어 sharingMapId가 없다. 대신 레이더가 스코프
// 키를 만들 때 쓸 수 있도록 고정 토큰을 돌려준다.
export const LMS_SCOPE_ID = "lms";

export function getSharingMapId() {
  return isLmsSpaceReservationPage() ? LMS_SCOPE_ID : null;
}

// 레이더를 띄울 수 있는 페이지인지.
export function isRadarSupportedPage() {
  return isLmsSpaceReservationPage();
}
