/* global SpeechSynthesisUtterance */
// Component for selecting your character's skin in game.

import AFRAME from 'aframe';
import { changeUserSkin } from '../utils.ts';
import hyperlinkFactory from './hyperlinkFactory.ts';

// Define a custom handler and use it to create a hyperlink component
const handler = function (this: any) {
  changeUserSkin(this.el.id);
  const msg = new SpeechSynthesisUtterance(`Changed skin to ${this.el.id}`);
  window.speechSynthesis.speak(msg);
};
const wearableSkinComponent = hyperlinkFactory(handler);

// Register the new component with A-FRAME
export default AFRAME.registerComponent('wearable-skin', wearableSkinComponent);
