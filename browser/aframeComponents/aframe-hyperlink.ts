// Component for using teleporters to navigate between VR scenes

import AFRAME from 'aframe';
import { navigateTo } from '../navigate.ts';
import hyperlinkFactory from './hyperlinkFactory.ts';

// Define a custom handler and use it to create a hyperlink component
const handler = function (this: any) {
  navigateTo(this.data);
};
const teleporterHyperlink = hyperlinkFactory(handler);

// Register the new component with A-FRAME
export default AFRAME.registerComponent('href', teleporterHyperlink);
