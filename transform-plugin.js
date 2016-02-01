var SpurEvents = require('spur-events');
var addListener = SpurEvents.addListener;
var removeListener = SpurEvents.removeListener;

var interactionLock = require('spur-interaction-lock');

var SLIDE_THRESHOLD = 8;

function TransformPlugin(component) {
  this.component = component;
}

TransformPlugin.prototype.reset = function () {
  removeListener(window, 'pointermove', this.onPointerMove, { context: this });
  removeListener(window, 'pointerup', this.onPointerUp, { context: this });
  removeListener(window, 'pointercancel', this.onPointerCancel, { context: this });
  if (this.lockId) { interactionLock.releaseLock(this.lockId); }
  this.isInitiated = false;
};

TransformPlugin.prototype.cancel = function () {
  this.isSliding = false;
  this.reset();
};

TransformPlugin.prototype.onPointerMove = function (e) {
  if (!this.isSliding) {
    var deltaX = e.clientX - this.startCoords.x;
    var deltaY = e.clientY - this.startCoords.y;
    var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance < SLIDE_THRESHOLD) {
      return;
    }

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      if ((!this.axis || this.axis === 'y') && (this.lockId = interactionLock.requestLockOn(e.target))) {
        this.isSliding = true;
        this.slideStart(e, this.boundingBox);
      } else {
        this.reset();
      }
      return;
    }

    if ((!this.axis || this.axis === 'x') && (this.lockId = interactionLock.requestLockOn(e.target))) {
      this.isSliding = true;
      this.slideStart(e, this.boundingBox);
    } else {
      this.reset();
    }
  }

  e.preventDefault();
  this.sliding(tap);
};

TransformPlugin.prototype.onPointerDown = function (e) {
  if (this.isInitiated) { return; }
  this.isInitiated = true;
  this.isSliding = false;
  this.startTime = Date.now();

  this.startCoords = {
    x: e.clientX,
    y: e.clientY
  }

  this.boundingBox = this.DOMNode.getBoundingClientRect();
  addListener(window, 'pointermove', this.onPointerMove, { context: this });
  addListener(window, 'pointercancel', this.cancel, { context: this });
  addListener(window, 'pointerup', this.onPointerUp, { context: this });
};

TransformPlugin.prototype.onPointerUp = function (e) {
  this.isSliding = false;
  this.reset();
};

TransformPlugin.prototype.componentDidMount = function (DOMNode) {
  this.DOMNode = DOMNode;
  addListener(this.DOMNode, 'pointerdown', this.onPointerDown, { context: this });
};

TransformPlugin.prototype.componentWillUnmount = function () {
  removeListener(this.DOMNode, 'pointerdown', this.onPointerDown, { context: this });
  this.reset();
  this.DOMNode = null;
  this.component = null;
};

module.exports = TransformPlugin;