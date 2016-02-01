var SpurEvents = require('spur-events');
var addListener = SpurEvents.addListener;
var removeListener = SpurEvents.removeListener;

var interactionLock = require('spur-interaction-lock');

var TRANSLATION_THRESHOLD = 8;

function TransformPlugin(component) {
  this.component = component;
  this.isTransforming = false;

  this.pointerId = null;
  this.firstPointer = {};
  this.additionalPointerId = null;
  this.additionalPointer = {};

  this.transform = {
    x: 0,
    y: 0,
    scale: 1
  };

  this.onWheelBound = this.onWheel.bind(this);
  this.zoom = 0;
  this.boundingBox = { left: 0, top: 0, width: 0, height: 0 };

  this.minScale = 0.1;
  this.maxScale = 3;

  this.translate = true;
}

TransformPlugin.prototype.setMaxScale = function (scale) {
  this.maxScale = scale;
}

TransformPlugin.prototype.setMinScale = function (scale) {
  this.minScale = scale;
}

TransformPlugin.prototype.setTranslateEnable = function (enable) {
  this.translate = enable;
};

TransformPlugin.prototype.setBoundingContainer = function (boundingBox) {
  this.boundingBox = boundingBox;
}

TransformPlugin.prototype.componentDidMount = function (DOMNode) {
  this.DOMNode = DOMNode;
  addListener(this.DOMNode, 'pointerdown', this.onPointerDown, { context: this });
  this.DOMNode.addEventListener('wheel', this.onWheelBound);
};

TransformPlugin.prototype.componentWillUnmount = function () {
  removeListener(this.DOMNode, 'pointerdown', this.onPointerDown, { context: this });
  this.DOMNode.removeEventListener('wheel', this.onWheelBound);
  this.reset();
  this.DOMNode = null;
  this.component = null;
};

TransformPlugin.prototype.onTransformStart = function () {
  if (this.component.onTransformStart) { this.component.onTransformStart(); }
  if (this.component.props.onTransformStart) { this.component.props.onTransformStart(); }
}

TransformPlugin.prototype.onTransform = function (transform) {
  if (this.component.onTransform) { this.component.onTransform(transform); }
  if (this.component.props.onTransform) { this.component.props.onTransform(transform); }
}

TransformPlugin.prototype.onTransformEnd = function () {
  if (this.component.onTransformEnd) { this.component.onTransformEnd(); }
  if (this.component.props.onTransformEnd) { this.component.props.onTransformEnd(); }
}

TransformPlugin.prototype.setInitialState = function (x, y, scale) {
  this.transform.x = x;
  this.transform.y = y;
  this.transform.scale = scale;
  this.zoom = scale - 1; 
};

TransformPlugin.prototype.reset = function () {
  removeListener(window, 'pointerdown', this.onAdditionalPointerDown, { context: this });
  removeListener(window, 'pointermove', this.onPointerMove, { context: this });
  removeListener(window, 'pointerup', this.onPointerUp, { context: this });
  removeListener(window, 'pointercancel', this.onPointerCancel, { context: this });
  if (this.lockId) { interactionLock.releaseLock(this.lockId); }
  this.isInitiated = false;
  this.pointerId = this.additionalPointerId = null;
};

TransformPlugin.prototype.cancel = function () {
  this.reset();
};

function isBelowThreshold(coords1, coords2) {
  var deltaX = coords1.clientX - coords2.x;
  var deltaY = coords1.clientY - coords2.y;
  var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  return distance < TRANSLATION_THRESHOLD;
}

TransformPlugin.prototype.handleTransform = function () {
  var startCenterX, startCenterY, currentCenterX, currentCenterY;
  if (this.additionalPointerId === null) {
    startCenterX = this.startCoords.x;
    currentCenterX = this.firstPointer.x;
    startCenterY = this.startCoords.y;
    currentCenterY = this.firstPointer.y;
  } else {
    startCenterX = this.startCoords.x - this.additionalStartCoords.x;
    currentCenterX = this.firstPointer.x - this.additionalPointer.x;
    startCenterY = this.startCoords.y - this.additionalStartCoords.y;
    currentCenterY = this.firstPointer.y - this.additionalPointer.y;
  }
  
  var x = this.startPos.x + currentCenterX - startCenterX;
  var y = this.startPos.y + currentCenterY - startCenterY;

  x = Math.min(Math.max(x, -this.boundingBox.width * (this.zoom)), 0);
  y = Math.min(Math.max(y, -this.boundingBox.height * (this.zoom)), 0);

  this.transform.x = x;
  this.transform.y = y;
  this.onTransform(this.transform);
};

TransformPlugin.prototype.onFirstPointerMove = function (e) {
  this.firstPointer.x = e.clientX;
  this.firstPointer.y = e.clientY;

  if (!this.isTransforming) {
    if (!this.translate || isBelowThreshold(e, this.startCoords)) { return; }

    this.lockId = interactionLock.requestLockOn(e.target);
    if (!this.lockId) { return this.reset(); }

    this.isTransforming = true;
    this.onTransformStart(e, this.boundingBox);
  }

  this.handleTransform();
};

TransformPlugin.prototype.onAdditionalPointerMove = function (e) {
  this.additionalPointer.x = e.clientX;
  this.additionalPointer.y = e.clientY;

  if (!this.isTransforming) {
    if (isBelowThreshold(e, this.firstPointer)) { return; } // pinch threshold ?

    this.lockId = interactionLock.requestLockOn(e.target);
    if (!this.lockId) { return this.reset(); }

    this.isTransforming = true;
    this.onTransformStart(e, this.boundingBox);
  }

  this.handleTransform();
};

TransformPlugin.prototype.onPointerMove = function (e) {
  if (e.pointerId === this.pointerId) {
    return this.onFirstPointerMove(e);
  }

  if (e.pointerId === this.additionalPointerId) {
    return this.onAdditionalPointerMove(e);
  }
};

TransformPlugin.prototype.onPointerDown = function (e) {
  if (this.isInitiated || (e.pointerType === 'mouse' && (!this.translate || e.buttons !== 1))) { return; }
  this.isInitiated = true;
  this.isTransforming = false;

  this.pointerId = e.pointerId;
  this.startCoords = {
    x: e.clientX,
    y: e.clientY
  }
  this.startPos = {
    x: this.transform.x,
    y: this.transform.y
  };

  addListener(window, 'pointerdown', this.onAdditionalPointerDown, { context: this });
  addListener(window, 'pointermove', this.onPointerMove, { context: this });
  addListener(window, 'pointercancel', this.cancel, { context: this });
  addListener(window, 'pointerup', this.onPointerUp, { context: this });
};

TransformPlugin.prototype.onAdditionalPointerDown = function (e) {
  if (this.additionalPointerId !== null || this.pointerId === e.pointerId) { return; }
  this.additionalPointerId = e.pointerId;
  this.additionalStartCoords = {
    x: e.clientX,
    y: e.clientY
  }
  this.additionalPointer.x = e.clientX;
  this.additionalPointer.y = e.clientY;
};

TransformPlugin.prototype.onPointerUp = function (e) {
  if (e.pointerId === this.pointerId) {
    if (this.additionalPointerId !== null) {
      this.pointerId = this.additionalPointerId;
      this.additionalPointerId = null;
      this.firstPointer.x = this.additionalPointer.x;
      this.firstPointer.y = this.additionalPointer.y;
    } else {
      this.isTransforming = false;
      this.onTransformEnd();
      this.reset();
    }

    return;
  }

  if (e.pointerId === this.additionalPointerId) {
    this.additionalPointerId = null;
  }
};

TransformPlugin.prototype.zoomTo = function (zoom, localX, localY) {
  zoom = Math.min(Math.max(zoom, this.minScale - 1), this.maxScale - 1);
  
  var x = this.transform.x;
  var y = this.transform.y;
  x = (-x + localX) / (this.zoom + 1) * (zoom + 1) - localX;
  y = (-y + localY) / (this.zoom + 1) * (zoom + 1) - localY;

  this.transform.scale *= (zoom + 1) / (this.zoom + 1);
  this.transform.x = Math.min(Math.max(-x, -this.boundingBox.width * zoom), 0);
  this.transform.y = Math.min(Math.max(-y, -this.boundingBox.height * zoom), 0);

  this.zoom = zoom;
  this.onTransform(this.transform);

  window.clearTimeout(this.wheelTimeout);
  this.wheelTimeout = window.setTimeout(() => {
    if (this.pointerId === null) {
      this.isTransforming = false;
      this.onTransformEnd();
    }
  }, 200);
};

TransformPlugin.prototype.onWheel = function (e) {
  var w = e.wheelDelta;
  var d = e.detail;
  var distance = 1;
  if (d) {
    if (w) distance = w / d / 40 * d > 0 ? 1 : -1; // Opera
    else distance = -d / 3; // Firefox TODO: do not /3 for OS X
  } else distance = w / 120;

  if (!this.isTransforming) {
    this.isTransforming = true;
    this.onTransformStart();
  }

  this.zoomTo(this.zoom + distance / 15, e.clientX - this.boundingBox.left, e.clientY - this.boundingBox.top);
  e.preventDefault();
  e.stopPropagation();
};

module.exports = TransformPlugin;