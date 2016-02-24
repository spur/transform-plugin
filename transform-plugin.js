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
		scale: 1,
		rotate: 0
	};

	this.onWheelBound = this.onWheel.bind(this);
	this.boundingBox = { left: 0, top: 0, right: 0, bottom: 0 };

	this.minScale = 0.1;
	this.maxScale = 3;

	this.translate = true;
	this.scale = true;
	this.rotation = false;
}

TransformPlugin.prototype.setMaxScale = function (scale) {
	this.maxScale = scale;
};

TransformPlugin.prototype.setMinScale = function (scale) {
	this.minScale = scale;
};

TransformPlugin.prototype.setTranslateEnable = function (enable) {
	this.translate = enable;
};

TransformPlugin.prototype.setScaleEnable = function (enable) {
	this.scale = enable;
};

TransformPlugin.prototype.setRotationEnable = function (enable) {
	this.rotation = enable;
};

TransformPlugin.prototype.setBoundingContainer = function (boundingBox) {
	this.boundingBox = boundingBox;
	var transform = this.transform;
	this.updateTransform(transform.x, transform.y, transform.scale, transform.rotate);
};

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
};

TransformPlugin.prototype.onTransformStart = function () {
	if (this.component.onTransformStart) { this.component.onTransformStart(); }
	if (this.component.props.onTransformStart) { this.component.props.onTransformStart(); }
};

TransformPlugin.prototype.onTransform = function (transform) {
	if (this.component.onTransform) { this.component.onTransform(transform); }
	if (this.component.props.onTransform) { this.component.props.onTransform(transform); }
};

TransformPlugin.prototype.onTransformEnd = function () {
	if (this.component.onTransformEnd) { this.component.onTransformEnd(); }
	if (this.component.props.onTransformEnd) { this.component.props.onTransformEnd(); }
};

TransformPlugin.prototype.setInitialState = function (state) {
	var x = state.x !== undefined ? state.x : this.transform.x;
	var y = state.y !== undefined ? state.y : this.transform.y;
	var scale = state.scale !== undefined ? state.scale : this.transform.scale;
	var rotate = state.rotate !== undefined ? state.rotate : this.transform.rotate;
	this.updateTransform(x, y, scale, rotate);
};

TransformPlugin.prototype.reset = function () {
	removeListener(window, 'pointerdown', this.onAdditionalPointerDown, { context: this });
	removeListener(window, 'pointermove', this.onPointerMove, { context: this });
	removeListener(window, 'pointerup', this.onPointerUp, { context: this });
	removeListener(window, 'pointercancel', this.onPointerCancel, { context: this });
	if (this.lockId) { interactionLock.releaseLock(this.lockId); }
	if (this.additionalLockId) { interactionLock.releaseLock(this.additionalLockId); }
	this.isInitiated = false;
	this.target = this.pointerId = this.additionalPointerId = null;
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

		if (this.scale) {
			var startDistance = startCenterX * startCenterX + startCenterY * startCenterY; // no need to use sqrt
			var currentDistance = currentCenterX * currentCenterX + currentCenterY * currentCenterY; // no need to use sqrt
			this.transform.scale = this.startScale * currentDistance / startDistance;
		}

		if (this.rotation) {
			var initialTapAngle = Math.atan2(startCenterX, startCenterY);
			var angleChange = initialTapAngle - Math.atan2(currentCenterX, currentCenterY);
			this.transform.rotate = this.initialAngle + angleChange;
		}
	}

	var x = this.startPos.x + currentCenterX - startCenterX;
	var y = this.startPos.y + currentCenterY - startCenterY;

	this.updateTransform(x, y, this.transform.scale, this.transform.rotate);

	this.onTransform(this.transform);
};

TransformPlugin.prototype.onFirstPointerMove = function (e) {
	this.firstPointer.x = e.clientX;
	this.firstPointer.y = e.clientY;

	if (!this.isTransforming) {
		if (!this.translate || isBelowThreshold(e, this.startCoords)) { return; }

		this.lockId = interactionLock.requestLockOn(e.target);
		if (!this.lockId) { return this.reset(); }

		this.startCoords.x = e.clientX;
		this.startCoords.y = e.clientY;
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

		this.lockId = interactionLock.requestLockOn(this.target);
		if (!this.lockId) { return this.reset(); }
		this.additionalLockId = interactionLock.requestLockOn(e.target);

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
	};

	this.startPos = {
		x: this.transform.x,
		y: this.transform.y
	};

	this.target = e.target;

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
	};
	this.startScale = this.transform.scale;
	this.initialAngle = this.transform.rotate;
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

TransformPlugin.prototype.updateTransform = function (x, y, scale, rotate) {
	this.transform.scale = Math.min(Math.max(scale, this.minScale), this.maxScale);
	this.transform.x = Math.max(Math.min(x, this.boundingBox.right), this.boundingBox.left);
	this.transform.y = Math.max(Math.min(y, this.boundingBox.bottom), this.boundingBox.top);
	this.transform.rotate = rotate;
};

TransformPlugin.prototype.scaleTo = function (scale, localX, localY) {
	scale = Math.min(Math.max(scale, this.minScale), this.maxScale);

	var scaleChange = scale / this.transform.scale;

	var x = localX - (localX - this.transform.x) * scaleChange;
	var y = localY - (localY - this.transform.y) * scaleChange;

	this.updateTransform(x, y, scale, this.transform.rotate);

	this.onTransform(this.transform);

	window.clearTimeout(this.wheelTimeout);
	var self = this;
	this.wheelTimeout = window.setTimeout(function () {
		if (self.pointerId === null) {
			self.isTransforming = false;
			self.onTransformEnd();
		}
	}, 200);
};

TransformPlugin.prototype.onWheel = function (e) {
	if (!this.scale) { return; }
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

	var boundingBox = this.DOMNode.getBoundingClientRect();

	this.scaleTo(
		this.transform.scale + distance / 15,
		e.clientX + this.transform.x - boundingBox.left,
		e.clientY + this.transform.y - boundingBox.top
	);

	e.preventDefault();
	e.stopPropagation();
};

module.exports = TransformPlugin;
