// Component for using teleporters to navigate between VR scenes

import AFRAME from 'aframe';
import { navigateTo } from '../navigate';
import hyperlinkFactory from './hyperlinkFactory';

// Define a custom handler and use it to create a hyperlink component
const handler = function () {
  navigateTo(this.data);
};
const teleporterHyperlink = hyperlinkFactory(handler);

// Register the new component with A-FRAME
export default AFRAME.registerComponent('href', teleporterHyperlink);
