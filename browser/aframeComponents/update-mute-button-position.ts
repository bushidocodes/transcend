// Pure helper used by publish-location's tick (issue #202). Kept out of the A-Frame
// component module so unit tests can import it without loading A-Frame.

// Keep the mute button under the local avatar. #mutebutton is created with the local avatar
// and destroyed on logout (avatars.removeLocal); during that teardown window tick can still
// run with a non-null tickRate, so the lookup must tolerate a missing element.
export function updateMuteButtonPosition (
  userPosition: { x: number, z: number },
  doc: Pick<Document, 'getElementById'> = document
): void {
  const mutebutton = doc.getElementById('mutebutton');
  if (!mutebutton) return;
  mutebutton.setAttribute('position', `${userPosition.x} 0.1 ${userPosition.z - 1}`);
}
