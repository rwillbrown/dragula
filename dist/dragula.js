(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.dragula = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var cache = {};
var start = '(?:^|\\s)';
var end = '(?:\\s|$)';

function lookupClass (className) {
  var cached = cache[className];
  if (cached) {
    cached.lastIndex = 0;
  } else {
    cache[className] = cached = new RegExp(start + className + end, 'g');
  }
  return cached;
}

function addClass (el, className) {
  var current = el.className;
  if (!current.length) {
    el.className = className;
  } else if (!lookupClass(className).test(current)) {
    el.className += ' ' + className;
  }
}

function rmClass (el, className) {
  el.className = el.className.replace(lookupClass(className), ' ').trim();
}

module.exports = {
  add: addClass,
  rm: rmClass
};

},{}],2:[function(require,module,exports){
(function (global){
'use strict';

var emitter = require('contra/emitter');
var crossvent = require('crossvent');
var classes = require('./classes');
var doc = document;
var documentElement = doc.documentElement;

function dragula (initialContainers, options) {
  var len = arguments.length;
  if (len === 1 && Array.isArray(initialContainers) === false) {
    options = initialContainers;
    initialContainers = [];
  }
  var _mirror; // mirror image
  var _source; // source container
  var _item; // item being dragged
  var _offsetX; // reference x
  var _offsetY; // reference y
  var _moveX; // reference move x
  var _moveY; // reference move y
  var _initialSibling; // reference sibling when grabbed
  var _currentSibling; // reference sibling now
  var _copy; // item used for copying
  var _renderTimer; // timer for setTimeout renderMirrorImage
  var _lastDropTarget = null; // last container item was over
  var _grabbed; // holds mousedown context until first mousemove

  var o = options || {};
  if (o.moves === void 0) { o.moves = always; }
  if (o.accepts === void 0) { o.accepts = always; }
  if (o.invalid === void 0) { o.invalid = invalidTarget; }
  if (o.containers === void 0) { o.containers = initialContainers || []; }
  if (o.isContainer === void 0) { o.isContainer = never; }
  if (o.copy === void 0) { o.copy = false; }
  if (o.copySortSource === void 0) { o.copySortSource = false; }
  if (o.revertOnSpill === void 0) { o.revertOnSpill = false; }
  if (o.removeOnSpill === void 0) { o.removeOnSpill = false; }
  if (o.direction === void 0) { o.direction = 'vertical'; }
  if (o.ignoreInputTextSelection === void 0) { o.ignoreInputTextSelection = true; }
  if (o.mirrorContainer === void 0) { o.mirrorContainer = doc.body; }
  if (o.scrollTriggerLeft === void 0) { o.scrollTriggerLeft = 70; }
  if (o.scrollTriggerRight === void 0) { o.scrollTriggerRight = 70; }
  if (o.scrollTriggerTop === void 0) { o.scrollTriggerTop = 70; }
  if (o.scrollTriggerBottom === void 0) { o.scrollTriggerBottom = 70; }

  var drake = emitter({
    containers: o.containers,
    start: manualStart,
    end: end,
    cancel: cancel,
    remove: remove,
    destroy: destroy,
    dragging: false,
    scrollTriggerLeft: o.scrollTriggerLeft,
    scrollTriggerRight: o.scrollTriggerRight,
    scrollTriggerTop: o.scrollTriggerTop,
    scrollTriggerBottom: o.scrollTriggerBottom
  });

  if (o.removeOnSpill === true) {
    drake.on('over', spillOver).on('out', spillOut);
  }

  events();

  return drake;

  function isContainer (el) {
    return drake.containers.indexOf(el) !== -1 || o.isContainer(el);
  }

  function events (remove) {
    var op = remove ? 'remove' : 'add';
    touchy(documentElement, op, 'mousedown', grab);
    touchy(documentElement, op, 'mouseup', release);
    touchy(documentElement, op, 'mousemove', onMouseMove);
  }

  function eventualMovements (remove) {
    var op = remove ? 'remove' : 'add';
    touchy(documentElement, op, 'mousemove', startBecauseMouseMoved);
  }

  function movements (remove) {
    var op = remove ? 'remove' : 'add';
    crossvent[op](documentElement, 'selectstart', preventGrabbed); // IE8
    crossvent[op](documentElement, 'click', preventGrabbed);
  }

  function destroy () {
    events(true);
    release({});
  }

  function preventGrabbed (e) {
    if (_grabbed) {
      e.preventDefault();
    }
  }

  function grab (e) {
    _moveX = e.clientX;
    _moveY = e.clientY;

    var button = whichMouseButton(e);
    var ignore = (e.type !== 'mousedown' ? button !== 0 : button !== 1) || e.metaKey || e.ctrlKey;
    if (ignore) {
      return; // we only care about honest-to-god left clicks and touch events
    }
    var item = e.target;
    var context = canStart(item);
    if (!context) {
      return;
    }
    _grabbed = context;
    eventualMovements();
    if (e.type === 'mousedown') {
      if (isInput(item)) { // see also: https://github.com/bevacqua/dragula/issues/208
        item.focus(); // fixes https://github.com/bevacqua/dragula/issues/176
      } else {
        e.preventDefault(); // fixes https://github.com/bevacqua/dragula/issues/155
      }
    }
  }

  function startBecauseMouseMoved (e) {
    if (!_grabbed) {
      return;
    }
    if (whichMouseButton(e) === 0) {
      release({});
      return; // when text is selected on an input and then dragged, mouseup doesn't fire. this is our only hope
    }
    // truthy check fixes #239, equality fixes #207
    if (e.clientX !== void 0 && e.clientX === _moveX && e.clientY !== void 0 && e.clientY === _moveY) {
      return;
    }
    if (o.ignoreInputTextSelection) {
      var clientX = getCoord('clientX', e);
      var clientY = getCoord('clientY', e);
      var elementBehindCursor = doc.elementFromPoint(clientX, clientY);
      if (isInput(elementBehindCursor)) {
        return;
      }
    }

    var grabbed = _grabbed; // call to end() unsets _grabbed
    eventualMovements(true);
    movements();
    end();
    start(grabbed);

    var offset = getOffset(_item);
    _offsetX = getCoord('pageX', e) - offset.left;
    _offsetY = getCoord('pageY', e) - offset.top;

    classes.add(_copy || _item, 'gu-transit');
    renderMirrorImage();
    drag(e);
  }

  function canStart (item) {
    if (drake.dragging && _mirror) {
      return;
    }
    if (isContainer(item)) {
      return; // don't drag container itself
    }
    var handle = item;
    while (getParent(item) && isContainer(getParent(item)) === false) {
      if (o.invalid(item, handle)) {
        return;
      }
      item = getParent(item); // drag target should be a top element
      if (!item) {
        return;
      }
    }
    var source = getParent(item);
    if (!source) {
      return;
    }
    if (o.invalid(item, handle)) {
      return;
    }

    var movable = o.moves(item, source, handle, nextEl(item));
    if (!movable) {
      return;
    }

    return {
      item: item,
      source: source
    };
  }

  function manualStart (item) {
    var context = canStart(item);
    if (context) {
      start(context);
    }
  }

  function start (context) {
    if (isCopy(context.item, context.source)) {
      _copy = context.item.cloneNode(true);
      drake.emit('cloned', _copy, context.item, 'copy');
    }

    _source = context.source;
    _item = context.item;
    _initialSibling = _currentSibling = nextEl(context.item);

    drake.dragging = true;
    drake.emit('drag', _item, _source);
  }

  function invalidTarget () {
    return false;
  }

  function end () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    drop(item, getParent(item));
  }

  function ungrab () {
    _grabbed = false;
    eventualMovements(true);
    movements(true);
  }

  function release (e) {
    ungrab();

    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    var clientX = getCoord('clientX', e);
    var clientY = getCoord('clientY', e);
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    if (dropTarget && ((_copy && o.copySortSource) || (!_copy || dropTarget !== _source))) {
      drop(item, dropTarget);
    } else if (o.removeOnSpill) {
      remove();
    } else {
      cancel();
    }
  }

  function drop (item, target) {
    var parent = getParent(item);
    if (_copy && o.copySortSource && target === _source) {
      parent.removeChild(_item);
    }
    if (isInitialPlacement(target)) {
      drake.emit('cancel', item, _source, _source);
    } else {
      drake.emit('drop', item, target, _source, _currentSibling);
    }
    cleanup();
  }

  function remove () {
    if (!drake.dragging) {
      return;
    }
    var item = _copy || _item;
    var parent = getParent(item);
    if (parent) {
      parent.removeChild(item);
    }
    drake.emit(_copy ? 'cancel' : 'remove', item, parent, _source);
    cleanup();
  }

  function cancel (revert) {
    if (!drake.dragging) {
      return;
    }
    var reverts = arguments.length > 0 ? revert : o.revertOnSpill;
    var item = _copy || _item;
    var parent = getParent(item);
    var initial = isInitialPlacement(parent);
    if (initial === false && reverts) {
      if (_copy) {
        if (parent) {
          parent.removeChild(_copy);
        }
      } else {
        _source.insertBefore(item, _initialSibling);
      }
    }
    if (initial || reverts) {
      drake.emit('cancel', item, _source, _source);
    } else {
      drake.emit('drop', item, parent, _source, _currentSibling);
    }
    cleanup();
  }

  function cleanup () {
    var item = _copy || _item;
    ungrab();
    removeMirrorImage();
    if (item) {
      classes.rm(item, 'gu-transit');
    }
    if (_renderTimer) {
      clearTimeout(_renderTimer);
    }
    drake.dragging = false;
    if (_lastDropTarget) {
      drake.emit('out', item, _lastDropTarget, _source);
    }
    drake.emit('dragend', item);
    _source = _item = _copy = _initialSibling = _currentSibling = _renderTimer = _lastDropTarget = null;
  }

  function isInitialPlacement (target, s) {
    var sibling;
    if (s !== void 0) {
      sibling = s;
    } else if (_mirror) {
      sibling = _currentSibling;
    } else {
      sibling = nextEl(_copy || _item);
    }
    return target === _source && sibling === _initialSibling;
  }

  function findDropTarget (elementBehindCursor, clientX, clientY) {
    var target = elementBehindCursor;
    while (target && !accepted()) {
      target = getParent(target);
    }
    return target;

    function accepted () {
      var droppable = isContainer(target);
      if (droppable === false) {
        return false;
      }

      var immediate = getImmediateChild(target, elementBehindCursor);
      var reference = getReference(target, immediate, clientX, clientY);
      var initial = isInitialPlacement(target, reference);
      if (initial) {
        return true; // should always be able to drop it right back where it was
      }
      return o.accepts(_item, target, _source, reference);
    }
  }

  function drag (e) {
    if (!_mirror) {
      return;
    }
    e.preventDefault();

    var clientX = getCoord('clientX', e);
    var clientY = getCoord('clientY', e);
    var x = clientX - _offsetX;
    var y = clientY - _offsetY;

    _mirror.style.left = x + 'px';
    _mirror.style.top = y + 'px';

    var item = _copy || _item;
    var elementBehindCursor = getElementBehindPoint(_mirror, clientX, clientY);
    var dropTarget = findDropTarget(elementBehindCursor, clientX, clientY);
    var changed = dropTarget !== null && dropTarget !== _lastDropTarget;
    if (changed || dropTarget === null) {
      out();
      _lastDropTarget = dropTarget;
      over();
    }
    var parent = getParent(item);
    if (dropTarget === _source && _copy && !o.copySortSource) {
      if (parent) {
        parent.removeChild(item);
      }
      return;
    }
    var reference;
    var immediate = getImmediateChild(dropTarget, elementBehindCursor);
    if (immediate !== null) {
      reference = getReference(dropTarget, immediate, clientX, clientY);
    } else if (o.revertOnSpill === true && !_copy) {
      reference = _initialSibling;
      dropTarget = _source;
    } else {
      if (_copy && parent) {
        parent.removeChild(item);
      }
      return;
    }
    if (
      (reference === null && changed) ||
      reference !== item &&
      reference !== nextEl(item)
    ) {
      _currentSibling = reference;
      dropTarget.insertBefore(item, reference);
      drake.emit('shadow', item, dropTarget, _source);
    }
    function moved (type) { drake.emit(type, item, _lastDropTarget, _source); }
    function over () { if (changed) { moved('over'); } }
    function out () { if (_lastDropTarget) { moved('out'); } }
  }

  function spillOver (el) {
    classes.rm(el, 'gu-hide');
  }

  function spillOut (el) {
    if (drake.dragging) { classes.add(el, 'gu-hide'); }
  }

  function renderMirrorImage () {
    if (_mirror) {
      return;
    }
    var rect = _item.getBoundingClientRect();
    _mirror = _item.cloneNode(true);
    _mirror.style.width = getRectWidth(rect) + 'px';
    _mirror.style.height = getRectHeight(rect) + 'px';
    classes.rm(_mirror, 'gu-transit');
    classes.add(_mirror, 'gu-mirror');
    o.mirrorContainer.appendChild(_mirror);
    touchy(documentElement, 'add', 'mousemove', drag);
    classes.add(o.mirrorContainer, 'gu-unselectable');
    drake.emit('cloned', _mirror, _item, 'mirror');
  }

  function removeMirrorImage () {
    if (_mirror) {
      classes.rm(o.mirrorContainer, 'gu-unselectable');
      touchy(documentElement, 'remove', 'mousemove', drag);
      getParent(_mirror).removeChild(_mirror);
      _mirror = null;
    }
  }

  function getImmediateChild (dropTarget, target) {
    var immediate = target;
    while (immediate !== dropTarget && getParent(immediate) !== dropTarget) {
      immediate = getParent(immediate);
    }
    if (immediate === documentElement) {
      return null;
    }
    return immediate;
  }

  function getReference (dropTarget, target, x, y) {
    var horizontal = o.direction === 'horizontal';
    var reference = target !== dropTarget ? inside() : outside();
    return reference;

    function outside () { // slower, but able to figure out any position
      var len = dropTarget.children.length;
      var i;
      var el;
      var rect;
      for (i = 0; i < len; i++) {
        el = dropTarget.children[i];
        rect = el.getBoundingClientRect();
        if (horizontal && (rect.left + rect.width / 2) > x) { return el; }
        if (!horizontal && (rect.top + rect.height / 2) > y) { return el; }
      }
      return null;
    }

    function inside () { // faster, but only available if dropped inside a child element
      var rect = target.getBoundingClientRect();
      if (horizontal) {
        return resolve(x > rect.left + getRectWidth(rect) / 2);
      }
      return resolve(y > rect.top + getRectHeight(rect) / 2);
    }

    function resolve (after) {
      return after ? nextEl(target) : target;
    }
  }

  function onMouseMove(e) {
        var y = getCoord('pageY', e);
        var x = getCoord('pageX', e);
        drake.previousX = x;
        drake.previousY = y;

        if (drake.dragging) {
            for (var i = 0; i < drake.containers.length; i++) {
                var container = drake.containers[i];
                var rect = container.getBoundingClientRect();

                var leftTriggerContainer = {
                    top: rect.top,
                    right: rect.left + o.scrollTriggerLeft,
                    bottom: rect.bottom,
                    left: rect.left
                };

                var rightTriggerContainer = {
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    left: rect.right - o.scrollTriggerRight
                };

                var topTriggerContainer = {
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.top + o.scrollTriggerTop,
                    left: rect.left
                };

                var bottomTriggerContainer = {
                    top: rect.bottom - o.scrollTriggerTop,
                    right: rect.right,
                    bottom: rect.bottom,
                    left: rect.left
                };

                if (y >= leftTriggerContainer.top && y <= leftTriggerContainer.bottom && x >= leftTriggerContainer.left && x <= leftTriggerContainer.right) {
                    scrollLeft(container, x);
                } else if (y >= rightTriggerContainer.top && y <= rightTriggerContainer.bottom && x >= rightTriggerContainer.left && x <= rightTriggerContainer.right) {
                    scrollRight(container, x);
                } else if (y >= topTriggerContainer.top && y <= topTriggerContainer.bottom && x >= topTriggerContainer.left && x <= topTriggerContainer.right) {
                    scrollUp(container, y);
                } else if (y >= bottomTriggerContainer.top && y <= bottomTriggerContainer.bottom && x >= bottomTriggerContainer.left && x <= bottomTriggerContainer.right) {
                    scrollDown(container, y);
                }
            }
        }
    }

    function scrollRight(container, x) {
        if (x === drake.previousX) {
            container.scrollLeft += 5;
            setTimeout(scrollRight.bind(this, container, x), 20);
        }
    }

    function scrollLeft(container, x) {
        if (x === drake.previousX) {
            container.scrollLeft -= 5;
            setTimeout(scrollLeft.bind(this, container, x), 20);
        }
    }

    function scrollUp(container, y) {
        if (y === drake.previousY) {
            container.scrollTop -= 5;
            setTimeout(scrollUp.bind(this, container, y), 20);
        }
    }

    function scrollDown(container, y) {
        if (y === drake.previousY) {
            container.scrollTop += 5;
            setTimeout(scrollDown.bind(this, container, y), 20);
        }
    }

  function isCopy (item, container) {
    return typeof o.copy === 'boolean' ? o.copy : o.copy(item, container);
  }
}

function touchy (el, op, type, fn) {
  var touch = {
    mouseup: 'touchend',
    mousedown: 'touchstart',
    mousemove: 'touchmove'
  };
  var pointers = {
    mouseup: 'pointerup',
    mousedown: 'pointerdown',
    mousemove: 'pointermove'
  };
  var microsoft = {
    mouseup: 'MSPointerUp',
    mousedown: 'MSPointerDown',
    mousemove: 'MSPointerMove'
  };
  if (global.navigator.pointerEnabled) {
    crossvent[op](el, pointers[type], fn);
  } else if (global.navigator.msPointerEnabled) {
    crossvent[op](el, microsoft[type], fn);
  } else {
    crossvent[op](el, touch[type], fn);
    crossvent[op](el, type, fn);
  }
}

function whichMouseButton (e) {
  if (e.touches !== void 0) { return e.touches.length; }
  if (e.which !== void 0 && e.which !== 0) { return e.which; } // see https://github.com/bevacqua/dragula/issues/261
  if (e.buttons !== void 0) { return e.buttons; }
  var button = e.button;
  if (button !== void 0) { // see https://github.com/jquery/jquery/blob/99e8ff1baa7ae341e94bb89c3e84570c7c3ad9ea/src/event.js#L573-L575
    return button & 1 ? 1 : button & 2 ? 3 : (button & 4 ? 2 : 0);
  }
}

function getOffset (el) {
  var rect = el.getBoundingClientRect();
  return {
    left: rect.left + getScroll('scrollLeft', 'pageXOffset'),
    top: rect.top + getScroll('scrollTop', 'pageYOffset')
  };
}

function getScroll (scrollProp, offsetProp) {
  if (typeof global[offsetProp] !== 'undefined') {
    return global[offsetProp];
  }
  if (documentElement.clientHeight) {
    return documentElement[scrollProp];
  }
  return doc.body[scrollProp];
}

function getElementBehindPoint (point, x, y) {
  var p = point || {};
  var state = p.className;
  var el;
  p.className += ' gu-hide';
  el = doc.elementFromPoint(x, y);
  p.className = state;
  return el;
}

function never () { return false; }
function always () { return true; }
function getRectWidth (rect) { return rect.width || (rect.right - rect.left); }
function getRectHeight (rect) { return rect.height || (rect.bottom - rect.top); }
function getParent (el) { return el.parentNode === doc ? null : el.parentNode; }
function isInput (el) { return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || isEditable(el); }
function isEditable (el) {
  if (!el) { return false; } // no parents were editable
  if (el.contentEditable === 'false') { return false; } // stop the lookup
  if (el.contentEditable === 'true') { return true; } // found a contentEditable element in the chain
  return isEditable(getParent(el)); // contentEditable is set to 'inherit'
}

function nextEl (el) {
  return el.nextElementSibling || manually();
  function manually () {
    var sibling = el;
    do {
      sibling = sibling.nextSibling;
    } while (sibling && sibling.nodeType !== 1);
    return sibling;
  }
}

function getEventHost (e) {
  // on touchend event, we have to use `e.changedTouches`
  // see http://stackoverflow.com/questions/7192563/touchend-event-properties
  // see https://github.com/bevacqua/dragula/issues/34
  if (e.targetTouches && e.targetTouches.length) {
    return e.targetTouches[0];
  }
  if (e.changedTouches && e.changedTouches.length) {
    return e.changedTouches[0];
  }
  return e;
}

function getCoord (coord, e) {
  var host = getEventHost(e);
  var missMap = {
    pageX: 'clientX', // IE8
    pageY: 'clientY' // IE8
  };
  if (coord in missMap && !(coord in host) && missMap[coord] in host) {
    coord = missMap[coord];
  }
  return host[coord];
}

module.exports = dragula;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./classes":1,"contra/emitter":4,"crossvent":8}],3:[function(require,module,exports){
'use strict';

var ticky = require('ticky');

module.exports = function debounce (fn, args, ctx) {
  if (!fn) { return; }
  ticky(function run () {
    fn.apply(ctx || null, args || []);
  });
};

},{"ticky":6}],4:[function(require,module,exports){
'use strict';

var atoa = require('atoa');
var debounce = require('./debounce');

module.exports = function emitter (thing, options) {
  var opts = options || {};
  var evt = {};
  if (thing === undefined) { thing = {}; }
  thing.on = function (type, fn) {
    if (!evt[type]) {
      evt[type] = [fn];
    } else {
      evt[type].push(fn);
    }
    return thing;
  };
  thing.once = function (type, fn) {
    fn._once = true; // thing.off(fn) still works!
    thing.on(type, fn);
    return thing;
  };
  thing.off = function (type, fn) {
    var c = arguments.length;
    if (c === 1) {
      delete evt[type];
    } else if (c === 0) {
      evt = {};
    } else {
      var et = evt[type];
      if (!et) { return thing; }
      et.splice(et.indexOf(fn), 1);
    }
    return thing;
  };
  thing.emit = function () {
    var args = atoa(arguments);
    return thing.emitterSnapshot(args.shift()).apply(this, args);
  };
  thing.emitterSnapshot = function (type) {
    var et = (evt[type] || []).slice(0);
    return function () {
      var args = atoa(arguments);
      var ctx = this || thing;
      if (type === 'error' && opts.throws !== false && !et.length) { throw args.length === 1 ? args[0] : args; }
      et.forEach(function emitter (listen) {
        if (opts.async) { debounce(listen, args, ctx); } else { listen.apply(ctx, args); }
        if (listen._once) { thing.off(type, listen); }
      });
      return thing;
    };
  };
  return thing;
};

},{"./debounce":3,"atoa":5}],5:[function(require,module,exports){
module.exports = function atoa (a, n) { return Array.prototype.slice.call(a, n); }

},{}],6:[function(require,module,exports){
var si = typeof setImmediate === 'function', tick;
if (si) {
  tick = function (fn) { setImmediate(fn); };
} else {
  tick = function (fn) { setTimeout(fn, 0); };
}

module.exports = tick;
},{}],7:[function(require,module,exports){
(function (global){

var NativeCustomEvent = global.CustomEvent;

function useNative () {
  try {
    var p = new NativeCustomEvent('cat', { detail: { foo: 'bar' } });
    return  'cat' === p.type && 'bar' === p.detail.foo;
  } catch (e) {
  }
  return false;
}

/**
 * Cross-browser `CustomEvent` constructor.
 *
 * https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent.CustomEvent
 *
 * @public
 */

module.exports = useNative() ? NativeCustomEvent :

// IE >= 9
'function' === typeof document.createEvent ? function CustomEvent (type, params) {
  var e = document.createEvent('CustomEvent');
  if (params) {
    e.initCustomEvent(type, params.bubbles, params.cancelable, params.detail);
  } else {
    e.initCustomEvent(type, false, false, void 0);
  }
  return e;
} :

// IE <= 8
function CustomEvent (type, params) {
  var e = document.createEventObject();
  e.type = type;
  if (params) {
    e.bubbles = Boolean(params.bubbles);
    e.cancelable = Boolean(params.cancelable);
    e.detail = params.detail;
  } else {
    e.bubbles = false;
    e.cancelable = false;
    e.detail = void 0;
  }
  return e;
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],8:[function(require,module,exports){
(function (global){
'use strict';

var customEvent = require('custom-event');
var eventmap = require('./eventmap');
var doc = global.document;
var addEvent = addEventEasy;
var removeEvent = removeEventEasy;
var hardCache = [];

if (!global.addEventListener) {
  addEvent = addEventHard;
  removeEvent = removeEventHard;
}

module.exports = {
  add: addEvent,
  remove: removeEvent,
  fabricate: fabricateEvent
};

function addEventEasy (el, type, fn, capturing) {
  return el.addEventListener(type, fn, capturing);
}

function addEventHard (el, type, fn) {
  return el.attachEvent('on' + type, wrap(el, type, fn));
}

function removeEventEasy (el, type, fn, capturing) {
  return el.removeEventListener(type, fn, capturing);
}

function removeEventHard (el, type, fn) {
  var listener = unwrap(el, type, fn);
  if (listener) {
    return el.detachEvent('on' + type, listener);
  }
}

function fabricateEvent (el, type, model) {
  var e = eventmap.indexOf(type) === -1 ? makeCustomEvent() : makeClassicEvent();
  if (el.dispatchEvent) {
    el.dispatchEvent(e);
  } else {
    el.fireEvent('on' + type, e);
  }
  function makeClassicEvent () {
    var e;
    if (doc.createEvent) {
      e = doc.createEvent('Event');
      e.initEvent(type, true, true);
    } else if (doc.createEventObject) {
      e = doc.createEventObject();
    }
    return e;
  }
  function makeCustomEvent () {
    return new customEvent(type, { detail: model });
  }
}

function wrapperFactory (el, type, fn) {
  return function wrapper (originalEvent) {
    var e = originalEvent || global.event;
    e.target = e.target || e.srcElement;
    e.preventDefault = e.preventDefault || function preventDefault () { e.returnValue = false; };
    e.stopPropagation = e.stopPropagation || function stopPropagation () { e.cancelBubble = true; };
    e.which = e.which || e.keyCode;
    fn.call(el, e);
  };
}

function wrap (el, type, fn) {
  var wrapper = unwrap(el, type, fn) || wrapperFactory(el, type, fn);
  hardCache.push({
    wrapper: wrapper,
    element: el,
    type: type,
    fn: fn
  });
  return wrapper;
}

function unwrap (el, type, fn) {
  var i = find(el, type, fn);
  if (i) {
    var wrapper = hardCache[i].wrapper;
    hardCache.splice(i, 1); // free up a tad of memory
    return wrapper;
  }
}

function find (el, type, fn) {
  var i, item;
  for (i = 0; i < hardCache.length; i++) {
    item = hardCache[i];
    if (item.element === el && item.type === type && item.fn === fn) {
      return i;
    }
  }
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./eventmap":9,"custom-event":7}],9:[function(require,module,exports){
(function (global){
'use strict';

var eventmap = [];
var eventname = '';
var ron = /^on/;

for (eventname in global) {
  if (ron.test(eventname)) {
    eventmap.push(eventname.slice(2));
  }
}

module.exports = eventmap;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}]},{},[2])(2)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJjbGFzc2VzLmpzIiwiZHJhZ3VsYS5qcyIsIm5vZGVfbW9kdWxlcy9jb250cmEvZGVib3VuY2UuanMiLCJub2RlX21vZHVsZXMvY29udHJhL2VtaXR0ZXIuanMiLCJub2RlX21vZHVsZXMvY29udHJhL25vZGVfbW9kdWxlcy9hdG9hL2F0b2EuanMiLCJub2RlX21vZHVsZXMvY29udHJhL25vZGVfbW9kdWxlcy90aWNreS90aWNreS1icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL2Nyb3NzdmVudC9ub2RlX21vZHVsZXMvY3VzdG9tLWV2ZW50L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Nyb3NzdmVudC9zcmMvY3Jvc3N2ZW50LmpzIiwibm9kZV9tb2R1bGVzL2Nyb3NzdmVudC9zcmMvZXZlbnRtYXAuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDcnJCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7OztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDckdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgY2FjaGUgPSB7fTtcbnZhciBzdGFydCA9ICcoPzpefFxcXFxzKSc7XG52YXIgZW5kID0gJyg/OlxcXFxzfCQpJztcblxuZnVuY3Rpb24gbG9va3VwQ2xhc3MgKGNsYXNzTmFtZSkge1xuICB2YXIgY2FjaGVkID0gY2FjaGVbY2xhc3NOYW1lXTtcbiAgaWYgKGNhY2hlZCkge1xuICAgIGNhY2hlZC5sYXN0SW5kZXggPSAwO1xuICB9IGVsc2Uge1xuICAgIGNhY2hlW2NsYXNzTmFtZV0gPSBjYWNoZWQgPSBuZXcgUmVnRXhwKHN0YXJ0ICsgY2xhc3NOYW1lICsgZW5kLCAnZycpO1xuICB9XG4gIHJldHVybiBjYWNoZWQ7XG59XG5cbmZ1bmN0aW9uIGFkZENsYXNzIChlbCwgY2xhc3NOYW1lKSB7XG4gIHZhciBjdXJyZW50ID0gZWwuY2xhc3NOYW1lO1xuICBpZiAoIWN1cnJlbnQubGVuZ3RoKSB7XG4gICAgZWwuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB9IGVsc2UgaWYgKCFsb29rdXBDbGFzcyhjbGFzc05hbWUpLnRlc3QoY3VycmVudCkpIHtcbiAgICBlbC5jbGFzc05hbWUgKz0gJyAnICsgY2xhc3NOYW1lO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJtQ2xhc3MgKGVsLCBjbGFzc05hbWUpIHtcbiAgZWwuY2xhc3NOYW1lID0gZWwuY2xhc3NOYW1lLnJlcGxhY2UobG9va3VwQ2xhc3MoY2xhc3NOYW1lKSwgJyAnKS50cmltKCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhZGQ6IGFkZENsYXNzLFxuICBybTogcm1DbGFzc1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEvZW1pdHRlcicpO1xudmFyIGNyb3NzdmVudCA9IHJlcXVpcmUoJ2Nyb3NzdmVudCcpO1xudmFyIGNsYXNzZXMgPSByZXF1aXJlKCcuL2NsYXNzZXMnKTtcbnZhciBkb2MgPSBkb2N1bWVudDtcbnZhciBkb2N1bWVudEVsZW1lbnQgPSBkb2MuZG9jdW1lbnRFbGVtZW50O1xuXG5mdW5jdGlvbiBkcmFndWxhIChpbml0aWFsQ29udGFpbmVycywgb3B0aW9ucykge1xuICB2YXIgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgaWYgKGxlbiA9PT0gMSAmJiBBcnJheS5pc0FycmF5KGluaXRpYWxDb250YWluZXJzKSA9PT0gZmFsc2UpIHtcbiAgICBvcHRpb25zID0gaW5pdGlhbENvbnRhaW5lcnM7XG4gICAgaW5pdGlhbENvbnRhaW5lcnMgPSBbXTtcbiAgfVxuICB2YXIgX21pcnJvcjsgLy8gbWlycm9yIGltYWdlXG4gIHZhciBfc291cmNlOyAvLyBzb3VyY2UgY29udGFpbmVyXG4gIHZhciBfaXRlbTsgLy8gaXRlbSBiZWluZyBkcmFnZ2VkXG4gIHZhciBfb2Zmc2V0WDsgLy8gcmVmZXJlbmNlIHhcbiAgdmFyIF9vZmZzZXRZOyAvLyByZWZlcmVuY2UgeVxuICB2YXIgX21vdmVYOyAvLyByZWZlcmVuY2UgbW92ZSB4XG4gIHZhciBfbW92ZVk7IC8vIHJlZmVyZW5jZSBtb3ZlIHlcbiAgdmFyIF9pbml0aWFsU2libGluZzsgLy8gcmVmZXJlbmNlIHNpYmxpbmcgd2hlbiBncmFiYmVkXG4gIHZhciBfY3VycmVudFNpYmxpbmc7IC8vIHJlZmVyZW5jZSBzaWJsaW5nIG5vd1xuICB2YXIgX2NvcHk7IC8vIGl0ZW0gdXNlZCBmb3IgY29weWluZ1xuICB2YXIgX3JlbmRlclRpbWVyOyAvLyB0aW1lciBmb3Igc2V0VGltZW91dCByZW5kZXJNaXJyb3JJbWFnZVxuICB2YXIgX2xhc3REcm9wVGFyZ2V0ID0gbnVsbDsgLy8gbGFzdCBjb250YWluZXIgaXRlbSB3YXMgb3ZlclxuICB2YXIgX2dyYWJiZWQ7IC8vIGhvbGRzIG1vdXNlZG93biBjb250ZXh0IHVudGlsIGZpcnN0IG1vdXNlbW92ZVxuXG4gIHZhciBvID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKG8ubW92ZXMgPT09IHZvaWQgMCkgeyBvLm1vdmVzID0gYWx3YXlzOyB9XG4gIGlmIChvLmFjY2VwdHMgPT09IHZvaWQgMCkgeyBvLmFjY2VwdHMgPSBhbHdheXM7IH1cbiAgaWYgKG8uaW52YWxpZCA9PT0gdm9pZCAwKSB7IG8uaW52YWxpZCA9IGludmFsaWRUYXJnZXQ7IH1cbiAgaWYgKG8uY29udGFpbmVycyA9PT0gdm9pZCAwKSB7IG8uY29udGFpbmVycyA9IGluaXRpYWxDb250YWluZXJzIHx8IFtdOyB9XG4gIGlmIChvLmlzQ29udGFpbmVyID09PSB2b2lkIDApIHsgby5pc0NvbnRhaW5lciA9IG5ldmVyOyB9XG4gIGlmIChvLmNvcHkgPT09IHZvaWQgMCkgeyBvLmNvcHkgPSBmYWxzZTsgfVxuICBpZiAoby5jb3B5U29ydFNvdXJjZSA9PT0gdm9pZCAwKSB7IG8uY29weVNvcnRTb3VyY2UgPSBmYWxzZTsgfVxuICBpZiAoby5yZXZlcnRPblNwaWxsID09PSB2b2lkIDApIHsgby5yZXZlcnRPblNwaWxsID0gZmFsc2U7IH1cbiAgaWYgKG8ucmVtb3ZlT25TcGlsbCA9PT0gdm9pZCAwKSB7IG8ucmVtb3ZlT25TcGlsbCA9IGZhbHNlOyB9XG4gIGlmIChvLmRpcmVjdGlvbiA9PT0gdm9pZCAwKSB7IG8uZGlyZWN0aW9uID0gJ3ZlcnRpY2FsJzsgfVxuICBpZiAoby5pZ25vcmVJbnB1dFRleHRTZWxlY3Rpb24gPT09IHZvaWQgMCkgeyBvLmlnbm9yZUlucHV0VGV4dFNlbGVjdGlvbiA9IHRydWU7IH1cbiAgaWYgKG8ubWlycm9yQ29udGFpbmVyID09PSB2b2lkIDApIHsgby5taXJyb3JDb250YWluZXIgPSBkb2MuYm9keTsgfVxuICBpZiAoby5zY3JvbGxUcmlnZ2VyTGVmdCA9PT0gdm9pZCAwKSB7IG8uc2Nyb2xsVHJpZ2dlckxlZnQgPSA3MDsgfVxuICBpZiAoby5zY3JvbGxUcmlnZ2VyUmlnaHQgPT09IHZvaWQgMCkgeyBvLnNjcm9sbFRyaWdnZXJSaWdodCA9IDcwOyB9XG4gIGlmIChvLnNjcm9sbFRyaWdnZXJUb3AgPT09IHZvaWQgMCkgeyBvLnNjcm9sbFRyaWdnZXJUb3AgPSA3MDsgfVxuICBpZiAoby5zY3JvbGxUcmlnZ2VyQm90dG9tID09PSB2b2lkIDApIHsgby5zY3JvbGxUcmlnZ2VyQm90dG9tID0gNzA7IH1cblxuICB2YXIgZHJha2UgPSBlbWl0dGVyKHtcbiAgICBjb250YWluZXJzOiBvLmNvbnRhaW5lcnMsXG4gICAgc3RhcnQ6IG1hbnVhbFN0YXJ0LFxuICAgIGVuZDogZW5kLFxuICAgIGNhbmNlbDogY2FuY2VsLFxuICAgIHJlbW92ZTogcmVtb3ZlLFxuICAgIGRlc3Ryb3k6IGRlc3Ryb3ksXG4gICAgZHJhZ2dpbmc6IGZhbHNlLFxuICAgIHNjcm9sbFRyaWdnZXJMZWZ0OiBvLnNjcm9sbFRyaWdnZXJMZWZ0LFxuICAgIHNjcm9sbFRyaWdnZXJSaWdodDogby5zY3JvbGxUcmlnZ2VyUmlnaHQsXG4gICAgc2Nyb2xsVHJpZ2dlclRvcDogby5zY3JvbGxUcmlnZ2VyVG9wLFxuICAgIHNjcm9sbFRyaWdnZXJCb3R0b206IG8uc2Nyb2xsVHJpZ2dlckJvdHRvbVxuICB9KTtcblxuICBpZiAoby5yZW1vdmVPblNwaWxsID09PSB0cnVlKSB7XG4gICAgZHJha2Uub24oJ292ZXInLCBzcGlsbE92ZXIpLm9uKCdvdXQnLCBzcGlsbE91dCk7XG4gIH1cblxuICBldmVudHMoKTtcblxuICByZXR1cm4gZHJha2U7XG5cbiAgZnVuY3Rpb24gaXNDb250YWluZXIgKGVsKSB7XG4gICAgcmV0dXJuIGRyYWtlLmNvbnRhaW5lcnMuaW5kZXhPZihlbCkgIT09IC0xIHx8IG8uaXNDb250YWluZXIoZWwpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXZlbnRzIChyZW1vdmUpIHtcbiAgICB2YXIgb3AgPSByZW1vdmUgPyAncmVtb3ZlJyA6ICdhZGQnO1xuICAgIHRvdWNoeShkb2N1bWVudEVsZW1lbnQsIG9wLCAnbW91c2Vkb3duJywgZ3JhYik7XG4gICAgdG91Y2h5KGRvY3VtZW50RWxlbWVudCwgb3AsICdtb3VzZXVwJywgcmVsZWFzZSk7XG4gICAgdG91Y2h5KGRvY3VtZW50RWxlbWVudCwgb3AsICdtb3VzZW1vdmUnLCBvbk1vdXNlTW92ZSk7XG4gIH1cblxuICBmdW5jdGlvbiBldmVudHVhbE1vdmVtZW50cyAocmVtb3ZlKSB7XG4gICAgdmFyIG9wID0gcmVtb3ZlID8gJ3JlbW92ZScgOiAnYWRkJztcbiAgICB0b3VjaHkoZG9jdW1lbnRFbGVtZW50LCBvcCwgJ21vdXNlbW92ZScsIHN0YXJ0QmVjYXVzZU1vdXNlTW92ZWQpO1xuICB9XG5cbiAgZnVuY3Rpb24gbW92ZW1lbnRzIChyZW1vdmUpIHtcbiAgICB2YXIgb3AgPSByZW1vdmUgPyAncmVtb3ZlJyA6ICdhZGQnO1xuICAgIGNyb3NzdmVudFtvcF0oZG9jdW1lbnRFbGVtZW50LCAnc2VsZWN0c3RhcnQnLCBwcmV2ZW50R3JhYmJlZCk7IC8vIElFOFxuICAgIGNyb3NzdmVudFtvcF0oZG9jdW1lbnRFbGVtZW50LCAnY2xpY2snLCBwcmV2ZW50R3JhYmJlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBkZXN0cm95ICgpIHtcbiAgICBldmVudHModHJ1ZSk7XG4gICAgcmVsZWFzZSh7fSk7XG4gIH1cblxuICBmdW5jdGlvbiBwcmV2ZW50R3JhYmJlZCAoZSkge1xuICAgIGlmIChfZ3JhYmJlZCkge1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGdyYWIgKGUpIHtcbiAgICBfbW92ZVggPSBlLmNsaWVudFg7XG4gICAgX21vdmVZID0gZS5jbGllbnRZO1xuXG4gICAgdmFyIGJ1dHRvbiA9IHdoaWNoTW91c2VCdXR0b24oZSk7XG4gICAgdmFyIGlnbm9yZSA9IChlLnR5cGUgIT09ICdtb3VzZWRvd24nID8gYnV0dG9uICE9PSAwIDogYnV0dG9uICE9PSAxKSB8fCBlLm1ldGFLZXkgfHwgZS5jdHJsS2V5O1xuICAgIGlmIChpZ25vcmUpIHtcbiAgICAgIHJldHVybjsgLy8gd2Ugb25seSBjYXJlIGFib3V0IGhvbmVzdC10by1nb2QgbGVmdCBjbGlja3MgYW5kIHRvdWNoIGV2ZW50c1xuICAgIH1cbiAgICB2YXIgaXRlbSA9IGUudGFyZ2V0O1xuICAgIHZhciBjb250ZXh0ID0gY2FuU3RhcnQoaXRlbSk7XG4gICAgaWYgKCFjb250ZXh0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIF9ncmFiYmVkID0gY29udGV4dDtcbiAgICBldmVudHVhbE1vdmVtZW50cygpO1xuICAgIGlmIChlLnR5cGUgPT09ICdtb3VzZWRvd24nKSB7XG4gICAgICBpZiAoaXNJbnB1dChpdGVtKSkgeyAvLyBzZWUgYWxzbzogaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2RyYWd1bGEvaXNzdWVzLzIwOFxuICAgICAgICBpdGVtLmZvY3VzKCk7IC8vIGZpeGVzIGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9kcmFndWxhL2lzc3Vlcy8xNzZcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTsgLy8gZml4ZXMgaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2RyYWd1bGEvaXNzdWVzLzE1NVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHN0YXJ0QmVjYXVzZU1vdXNlTW92ZWQgKGUpIHtcbiAgICBpZiAoIV9ncmFiYmVkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICh3aGljaE1vdXNlQnV0dG9uKGUpID09PSAwKSB7XG4gICAgICByZWxlYXNlKHt9KTtcbiAgICAgIHJldHVybjsgLy8gd2hlbiB0ZXh0IGlzIHNlbGVjdGVkIG9uIGFuIGlucHV0IGFuZCB0aGVuIGRyYWdnZWQsIG1vdXNldXAgZG9lc24ndCBmaXJlLiB0aGlzIGlzIG91ciBvbmx5IGhvcGVcbiAgICB9XG4gICAgLy8gdHJ1dGh5IGNoZWNrIGZpeGVzICMyMzksIGVxdWFsaXR5IGZpeGVzICMyMDdcbiAgICBpZiAoZS5jbGllbnRYICE9PSB2b2lkIDAgJiYgZS5jbGllbnRYID09PSBfbW92ZVggJiYgZS5jbGllbnRZICE9PSB2b2lkIDAgJiYgZS5jbGllbnRZID09PSBfbW92ZVkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKG8uaWdub3JlSW5wdXRUZXh0U2VsZWN0aW9uKSB7XG4gICAgICB2YXIgY2xpZW50WCA9IGdldENvb3JkKCdjbGllbnRYJywgZSk7XG4gICAgICB2YXIgY2xpZW50WSA9IGdldENvb3JkKCdjbGllbnRZJywgZSk7XG4gICAgICB2YXIgZWxlbWVudEJlaGluZEN1cnNvciA9IGRvYy5lbGVtZW50RnJvbVBvaW50KGNsaWVudFgsIGNsaWVudFkpO1xuICAgICAgaWYgKGlzSW5wdXQoZWxlbWVudEJlaGluZEN1cnNvcikpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhciBncmFiYmVkID0gX2dyYWJiZWQ7IC8vIGNhbGwgdG8gZW5kKCkgdW5zZXRzIF9ncmFiYmVkXG4gICAgZXZlbnR1YWxNb3ZlbWVudHModHJ1ZSk7XG4gICAgbW92ZW1lbnRzKCk7XG4gICAgZW5kKCk7XG4gICAgc3RhcnQoZ3JhYmJlZCk7XG5cbiAgICB2YXIgb2Zmc2V0ID0gZ2V0T2Zmc2V0KF9pdGVtKTtcbiAgICBfb2Zmc2V0WCA9IGdldENvb3JkKCdwYWdlWCcsIGUpIC0gb2Zmc2V0LmxlZnQ7XG4gICAgX29mZnNldFkgPSBnZXRDb29yZCgncGFnZVknLCBlKSAtIG9mZnNldC50b3A7XG5cbiAgICBjbGFzc2VzLmFkZChfY29weSB8fCBfaXRlbSwgJ2d1LXRyYW5zaXQnKTtcbiAgICByZW5kZXJNaXJyb3JJbWFnZSgpO1xuICAgIGRyYWcoZSk7XG4gIH1cblxuICBmdW5jdGlvbiBjYW5TdGFydCAoaXRlbSkge1xuICAgIGlmIChkcmFrZS5kcmFnZ2luZyAmJiBfbWlycm9yKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpc0NvbnRhaW5lcihpdGVtKSkge1xuICAgICAgcmV0dXJuOyAvLyBkb24ndCBkcmFnIGNvbnRhaW5lciBpdHNlbGZcbiAgICB9XG4gICAgdmFyIGhhbmRsZSA9IGl0ZW07XG4gICAgd2hpbGUgKGdldFBhcmVudChpdGVtKSAmJiBpc0NvbnRhaW5lcihnZXRQYXJlbnQoaXRlbSkpID09PSBmYWxzZSkge1xuICAgICAgaWYgKG8uaW52YWxpZChpdGVtLCBoYW5kbGUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGl0ZW0gPSBnZXRQYXJlbnQoaXRlbSk7IC8vIGRyYWcgdGFyZ2V0IHNob3VsZCBiZSBhIHRvcCBlbGVtZW50XG4gICAgICBpZiAoIWl0ZW0pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cbiAgICB2YXIgc291cmNlID0gZ2V0UGFyZW50KGl0ZW0pO1xuICAgIGlmICghc291cmNlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChvLmludmFsaWQoaXRlbSwgaGFuZGxlKSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBtb3ZhYmxlID0gby5tb3ZlcyhpdGVtLCBzb3VyY2UsIGhhbmRsZSwgbmV4dEVsKGl0ZW0pKTtcbiAgICBpZiAoIW1vdmFibGUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgaXRlbTogaXRlbSxcbiAgICAgIHNvdXJjZTogc291cmNlXG4gICAgfTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG1hbnVhbFN0YXJ0IChpdGVtKSB7XG4gICAgdmFyIGNvbnRleHQgPSBjYW5TdGFydChpdGVtKTtcbiAgICBpZiAoY29udGV4dCkge1xuICAgICAgc3RhcnQoY29udGV4dCk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gc3RhcnQgKGNvbnRleHQpIHtcbiAgICBpZiAoaXNDb3B5KGNvbnRleHQuaXRlbSwgY29udGV4dC5zb3VyY2UpKSB7XG4gICAgICBfY29weSA9IGNvbnRleHQuaXRlbS5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgICBkcmFrZS5lbWl0KCdjbG9uZWQnLCBfY29weSwgY29udGV4dC5pdGVtLCAnY29weScpO1xuICAgIH1cblxuICAgIF9zb3VyY2UgPSBjb250ZXh0LnNvdXJjZTtcbiAgICBfaXRlbSA9IGNvbnRleHQuaXRlbTtcbiAgICBfaW5pdGlhbFNpYmxpbmcgPSBfY3VycmVudFNpYmxpbmcgPSBuZXh0RWwoY29udGV4dC5pdGVtKTtcblxuICAgIGRyYWtlLmRyYWdnaW5nID0gdHJ1ZTtcbiAgICBkcmFrZS5lbWl0KCdkcmFnJywgX2l0ZW0sIF9zb3VyY2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gaW52YWxpZFRhcmdldCAoKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgZnVuY3Rpb24gZW5kICgpIHtcbiAgICBpZiAoIWRyYWtlLmRyYWdnaW5nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgZHJvcChpdGVtLCBnZXRQYXJlbnQoaXRlbSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gdW5ncmFiICgpIHtcbiAgICBfZ3JhYmJlZCA9IGZhbHNlO1xuICAgIGV2ZW50dWFsTW92ZW1lbnRzKHRydWUpO1xuICAgIG1vdmVtZW50cyh0cnVlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbGVhc2UgKGUpIHtcbiAgICB1bmdyYWIoKTtcblxuICAgIGlmICghZHJha2UuZHJhZ2dpbmcpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIGl0ZW0gPSBfY29weSB8fCBfaXRlbTtcbiAgICB2YXIgY2xpZW50WCA9IGdldENvb3JkKCdjbGllbnRYJywgZSk7XG4gICAgdmFyIGNsaWVudFkgPSBnZXRDb29yZCgnY2xpZW50WScsIGUpO1xuICAgIHZhciBlbGVtZW50QmVoaW5kQ3Vyc29yID0gZ2V0RWxlbWVudEJlaGluZFBvaW50KF9taXJyb3IsIGNsaWVudFgsIGNsaWVudFkpO1xuICAgIHZhciBkcm9wVGFyZ2V0ID0gZmluZERyb3BUYXJnZXQoZWxlbWVudEJlaGluZEN1cnNvciwgY2xpZW50WCwgY2xpZW50WSk7XG4gICAgaWYgKGRyb3BUYXJnZXQgJiYgKChfY29weSAmJiBvLmNvcHlTb3J0U291cmNlKSB8fCAoIV9jb3B5IHx8IGRyb3BUYXJnZXQgIT09IF9zb3VyY2UpKSkge1xuICAgICAgZHJvcChpdGVtLCBkcm9wVGFyZ2V0KTtcbiAgICB9IGVsc2UgaWYgKG8ucmVtb3ZlT25TcGlsbCkge1xuICAgICAgcmVtb3ZlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNhbmNlbCgpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRyb3AgKGl0ZW0sIHRhcmdldCkge1xuICAgIHZhciBwYXJlbnQgPSBnZXRQYXJlbnQoaXRlbSk7XG4gICAgaWYgKF9jb3B5ICYmIG8uY29weVNvcnRTb3VyY2UgJiYgdGFyZ2V0ID09PSBfc291cmNlKSB7XG4gICAgICBwYXJlbnQucmVtb3ZlQ2hpbGQoX2l0ZW0pO1xuICAgIH1cbiAgICBpZiAoaXNJbml0aWFsUGxhY2VtZW50KHRhcmdldCkpIHtcbiAgICAgIGRyYWtlLmVtaXQoJ2NhbmNlbCcsIGl0ZW0sIF9zb3VyY2UsIF9zb3VyY2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkcmFrZS5lbWl0KCdkcm9wJywgaXRlbSwgdGFyZ2V0LCBfc291cmNlLCBfY3VycmVudFNpYmxpbmcpO1xuICAgIH1cbiAgICBjbGVhbnVwKCk7XG4gIH1cblxuICBmdW5jdGlvbiByZW1vdmUgKCkge1xuICAgIGlmICghZHJha2UuZHJhZ2dpbmcpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIGl0ZW0gPSBfY29weSB8fCBfaXRlbTtcbiAgICB2YXIgcGFyZW50ID0gZ2V0UGFyZW50KGl0ZW0pO1xuICAgIGlmIChwYXJlbnQpIHtcbiAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChpdGVtKTtcbiAgICB9XG4gICAgZHJha2UuZW1pdChfY29weSA/ICdjYW5jZWwnIDogJ3JlbW92ZScsIGl0ZW0sIHBhcmVudCwgX3NvdXJjZSk7XG4gICAgY2xlYW51cCgpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2FuY2VsIChyZXZlcnQpIHtcbiAgICBpZiAoIWRyYWtlLmRyYWdnaW5nKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciByZXZlcnRzID0gYXJndW1lbnRzLmxlbmd0aCA+IDAgPyByZXZlcnQgOiBvLnJldmVydE9uU3BpbGw7XG4gICAgdmFyIGl0ZW0gPSBfY29weSB8fCBfaXRlbTtcbiAgICB2YXIgcGFyZW50ID0gZ2V0UGFyZW50KGl0ZW0pO1xuICAgIHZhciBpbml0aWFsID0gaXNJbml0aWFsUGxhY2VtZW50KHBhcmVudCk7XG4gICAgaWYgKGluaXRpYWwgPT09IGZhbHNlICYmIHJldmVydHMpIHtcbiAgICAgIGlmIChfY29weSkge1xuICAgICAgICBpZiAocGFyZW50KSB7XG4gICAgICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKF9jb3B5KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgX3NvdXJjZS5pbnNlcnRCZWZvcmUoaXRlbSwgX2luaXRpYWxTaWJsaW5nKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGluaXRpYWwgfHwgcmV2ZXJ0cykge1xuICAgICAgZHJha2UuZW1pdCgnY2FuY2VsJywgaXRlbSwgX3NvdXJjZSwgX3NvdXJjZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRyYWtlLmVtaXQoJ2Ryb3AnLCBpdGVtLCBwYXJlbnQsIF9zb3VyY2UsIF9jdXJyZW50U2libGluZyk7XG4gICAgfVxuICAgIGNsZWFudXAoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFudXAgKCkge1xuICAgIHZhciBpdGVtID0gX2NvcHkgfHwgX2l0ZW07XG4gICAgdW5ncmFiKCk7XG4gICAgcmVtb3ZlTWlycm9ySW1hZ2UoKTtcbiAgICBpZiAoaXRlbSkge1xuICAgICAgY2xhc3Nlcy5ybShpdGVtLCAnZ3UtdHJhbnNpdCcpO1xuICAgIH1cbiAgICBpZiAoX3JlbmRlclRpbWVyKSB7XG4gICAgICBjbGVhclRpbWVvdXQoX3JlbmRlclRpbWVyKTtcbiAgICB9XG4gICAgZHJha2UuZHJhZ2dpbmcgPSBmYWxzZTtcbiAgICBpZiAoX2xhc3REcm9wVGFyZ2V0KSB7XG4gICAgICBkcmFrZS5lbWl0KCdvdXQnLCBpdGVtLCBfbGFzdERyb3BUYXJnZXQsIF9zb3VyY2UpO1xuICAgIH1cbiAgICBkcmFrZS5lbWl0KCdkcmFnZW5kJywgaXRlbSk7XG4gICAgX3NvdXJjZSA9IF9pdGVtID0gX2NvcHkgPSBfaW5pdGlhbFNpYmxpbmcgPSBfY3VycmVudFNpYmxpbmcgPSBfcmVuZGVyVGltZXIgPSBfbGFzdERyb3BUYXJnZXQgPSBudWxsO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNJbml0aWFsUGxhY2VtZW50ICh0YXJnZXQsIHMpIHtcbiAgICB2YXIgc2libGluZztcbiAgICBpZiAocyAhPT0gdm9pZCAwKSB7XG4gICAgICBzaWJsaW5nID0gcztcbiAgICB9IGVsc2UgaWYgKF9taXJyb3IpIHtcbiAgICAgIHNpYmxpbmcgPSBfY3VycmVudFNpYmxpbmc7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNpYmxpbmcgPSBuZXh0RWwoX2NvcHkgfHwgX2l0ZW0pO1xuICAgIH1cbiAgICByZXR1cm4gdGFyZ2V0ID09PSBfc291cmNlICYmIHNpYmxpbmcgPT09IF9pbml0aWFsU2libGluZztcbiAgfVxuXG4gIGZ1bmN0aW9uIGZpbmREcm9wVGFyZ2V0IChlbGVtZW50QmVoaW5kQ3Vyc29yLCBjbGllbnRYLCBjbGllbnRZKSB7XG4gICAgdmFyIHRhcmdldCA9IGVsZW1lbnRCZWhpbmRDdXJzb3I7XG4gICAgd2hpbGUgKHRhcmdldCAmJiAhYWNjZXB0ZWQoKSkge1xuICAgICAgdGFyZ2V0ID0gZ2V0UGFyZW50KHRhcmdldCk7XG4gICAgfVxuICAgIHJldHVybiB0YXJnZXQ7XG5cbiAgICBmdW5jdGlvbiBhY2NlcHRlZCAoKSB7XG4gICAgICB2YXIgZHJvcHBhYmxlID0gaXNDb250YWluZXIodGFyZ2V0KTtcbiAgICAgIGlmIChkcm9wcGFibGUgPT09IGZhbHNlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cblxuICAgICAgdmFyIGltbWVkaWF0ZSA9IGdldEltbWVkaWF0ZUNoaWxkKHRhcmdldCwgZWxlbWVudEJlaGluZEN1cnNvcik7XG4gICAgICB2YXIgcmVmZXJlbmNlID0gZ2V0UmVmZXJlbmNlKHRhcmdldCwgaW1tZWRpYXRlLCBjbGllbnRYLCBjbGllbnRZKTtcbiAgICAgIHZhciBpbml0aWFsID0gaXNJbml0aWFsUGxhY2VtZW50KHRhcmdldCwgcmVmZXJlbmNlKTtcbiAgICAgIGlmIChpbml0aWFsKSB7XG4gICAgICAgIHJldHVybiB0cnVlOyAvLyBzaG91bGQgYWx3YXlzIGJlIGFibGUgdG8gZHJvcCBpdCByaWdodCBiYWNrIHdoZXJlIGl0IHdhc1xuICAgICAgfVxuICAgICAgcmV0dXJuIG8uYWNjZXB0cyhfaXRlbSwgdGFyZ2V0LCBfc291cmNlLCByZWZlcmVuY2UpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYWcgKGUpIHtcbiAgICBpZiAoIV9taXJyb3IpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG4gICAgdmFyIGNsaWVudFggPSBnZXRDb29yZCgnY2xpZW50WCcsIGUpO1xuICAgIHZhciBjbGllbnRZID0gZ2V0Q29vcmQoJ2NsaWVudFknLCBlKTtcbiAgICB2YXIgeCA9IGNsaWVudFggLSBfb2Zmc2V0WDtcbiAgICB2YXIgeSA9IGNsaWVudFkgLSBfb2Zmc2V0WTtcblxuICAgIF9taXJyb3Iuc3R5bGUubGVmdCA9IHggKyAncHgnO1xuICAgIF9taXJyb3Iuc3R5bGUudG9wID0geSArICdweCc7XG5cbiAgICB2YXIgaXRlbSA9IF9jb3B5IHx8IF9pdGVtO1xuICAgIHZhciBlbGVtZW50QmVoaW5kQ3Vyc29yID0gZ2V0RWxlbWVudEJlaGluZFBvaW50KF9taXJyb3IsIGNsaWVudFgsIGNsaWVudFkpO1xuICAgIHZhciBkcm9wVGFyZ2V0ID0gZmluZERyb3BUYXJnZXQoZWxlbWVudEJlaGluZEN1cnNvciwgY2xpZW50WCwgY2xpZW50WSk7XG4gICAgdmFyIGNoYW5nZWQgPSBkcm9wVGFyZ2V0ICE9PSBudWxsICYmIGRyb3BUYXJnZXQgIT09IF9sYXN0RHJvcFRhcmdldDtcbiAgICBpZiAoY2hhbmdlZCB8fCBkcm9wVGFyZ2V0ID09PSBudWxsKSB7XG4gICAgICBvdXQoKTtcbiAgICAgIF9sYXN0RHJvcFRhcmdldCA9IGRyb3BUYXJnZXQ7XG4gICAgICBvdmVyKCk7XG4gICAgfVxuICAgIHZhciBwYXJlbnQgPSBnZXRQYXJlbnQoaXRlbSk7XG4gICAgaWYgKGRyb3BUYXJnZXQgPT09IF9zb3VyY2UgJiYgX2NvcHkgJiYgIW8uY29weVNvcnRTb3VyY2UpIHtcbiAgICAgIGlmIChwYXJlbnQpIHtcbiAgICAgICAgcGFyZW50LnJlbW92ZUNoaWxkKGl0ZW0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgcmVmZXJlbmNlO1xuICAgIHZhciBpbW1lZGlhdGUgPSBnZXRJbW1lZGlhdGVDaGlsZChkcm9wVGFyZ2V0LCBlbGVtZW50QmVoaW5kQ3Vyc29yKTtcbiAgICBpZiAoaW1tZWRpYXRlICE9PSBudWxsKSB7XG4gICAgICByZWZlcmVuY2UgPSBnZXRSZWZlcmVuY2UoZHJvcFRhcmdldCwgaW1tZWRpYXRlLCBjbGllbnRYLCBjbGllbnRZKTtcbiAgICB9IGVsc2UgaWYgKG8ucmV2ZXJ0T25TcGlsbCA9PT0gdHJ1ZSAmJiAhX2NvcHkpIHtcbiAgICAgIHJlZmVyZW5jZSA9IF9pbml0aWFsU2libGluZztcbiAgICAgIGRyb3BUYXJnZXQgPSBfc291cmNlO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoX2NvcHkgJiYgcGFyZW50KSB7XG4gICAgICAgIHBhcmVudC5yZW1vdmVDaGlsZChpdGVtKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgKHJlZmVyZW5jZSA9PT0gbnVsbCAmJiBjaGFuZ2VkKSB8fFxuICAgICAgcmVmZXJlbmNlICE9PSBpdGVtICYmXG4gICAgICByZWZlcmVuY2UgIT09IG5leHRFbChpdGVtKVxuICAgICkge1xuICAgICAgX2N1cnJlbnRTaWJsaW5nID0gcmVmZXJlbmNlO1xuICAgICAgZHJvcFRhcmdldC5pbnNlcnRCZWZvcmUoaXRlbSwgcmVmZXJlbmNlKTtcbiAgICAgIGRyYWtlLmVtaXQoJ3NoYWRvdycsIGl0ZW0sIGRyb3BUYXJnZXQsIF9zb3VyY2UpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBtb3ZlZCAodHlwZSkgeyBkcmFrZS5lbWl0KHR5cGUsIGl0ZW0sIF9sYXN0RHJvcFRhcmdldCwgX3NvdXJjZSk7IH1cbiAgICBmdW5jdGlvbiBvdmVyICgpIHsgaWYgKGNoYW5nZWQpIHsgbW92ZWQoJ292ZXInKTsgfSB9XG4gICAgZnVuY3Rpb24gb3V0ICgpIHsgaWYgKF9sYXN0RHJvcFRhcmdldCkgeyBtb3ZlZCgnb3V0Jyk7IH0gfVxuICB9XG5cbiAgZnVuY3Rpb24gc3BpbGxPdmVyIChlbCkge1xuICAgIGNsYXNzZXMucm0oZWwsICdndS1oaWRlJyk7XG4gIH1cblxuICBmdW5jdGlvbiBzcGlsbE91dCAoZWwpIHtcbiAgICBpZiAoZHJha2UuZHJhZ2dpbmcpIHsgY2xhc3Nlcy5hZGQoZWwsICdndS1oaWRlJyk7IH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHJlbmRlck1pcnJvckltYWdlICgpIHtcbiAgICBpZiAoX21pcnJvcikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgcmVjdCA9IF9pdGVtLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIF9taXJyb3IgPSBfaXRlbS5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgX21pcnJvci5zdHlsZS53aWR0aCA9IGdldFJlY3RXaWR0aChyZWN0KSArICdweCc7XG4gICAgX21pcnJvci5zdHlsZS5oZWlnaHQgPSBnZXRSZWN0SGVpZ2h0KHJlY3QpICsgJ3B4JztcbiAgICBjbGFzc2VzLnJtKF9taXJyb3IsICdndS10cmFuc2l0Jyk7XG4gICAgY2xhc3Nlcy5hZGQoX21pcnJvciwgJ2d1LW1pcnJvcicpO1xuICAgIG8ubWlycm9yQ29udGFpbmVyLmFwcGVuZENoaWxkKF9taXJyb3IpO1xuICAgIHRvdWNoeShkb2N1bWVudEVsZW1lbnQsICdhZGQnLCAnbW91c2Vtb3ZlJywgZHJhZyk7XG4gICAgY2xhc3Nlcy5hZGQoby5taXJyb3JDb250YWluZXIsICdndS11bnNlbGVjdGFibGUnKTtcbiAgICBkcmFrZS5lbWl0KCdjbG9uZWQnLCBfbWlycm9yLCBfaXRlbSwgJ21pcnJvcicpO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVtb3ZlTWlycm9ySW1hZ2UgKCkge1xuICAgIGlmIChfbWlycm9yKSB7XG4gICAgICBjbGFzc2VzLnJtKG8ubWlycm9yQ29udGFpbmVyLCAnZ3UtdW5zZWxlY3RhYmxlJyk7XG4gICAgICB0b3VjaHkoZG9jdW1lbnRFbGVtZW50LCAncmVtb3ZlJywgJ21vdXNlbW92ZScsIGRyYWcpO1xuICAgICAgZ2V0UGFyZW50KF9taXJyb3IpLnJlbW92ZUNoaWxkKF9taXJyb3IpO1xuICAgICAgX21pcnJvciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZ2V0SW1tZWRpYXRlQ2hpbGQgKGRyb3BUYXJnZXQsIHRhcmdldCkge1xuICAgIHZhciBpbW1lZGlhdGUgPSB0YXJnZXQ7XG4gICAgd2hpbGUgKGltbWVkaWF0ZSAhPT0gZHJvcFRhcmdldCAmJiBnZXRQYXJlbnQoaW1tZWRpYXRlKSAhPT0gZHJvcFRhcmdldCkge1xuICAgICAgaW1tZWRpYXRlID0gZ2V0UGFyZW50KGltbWVkaWF0ZSk7XG4gICAgfVxuICAgIGlmIChpbW1lZGlhdGUgPT09IGRvY3VtZW50RWxlbWVudCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBpbW1lZGlhdGU7XG4gIH1cblxuICBmdW5jdGlvbiBnZXRSZWZlcmVuY2UgKGRyb3BUYXJnZXQsIHRhcmdldCwgeCwgeSkge1xuICAgIHZhciBob3Jpem9udGFsID0gby5kaXJlY3Rpb24gPT09ICdob3Jpem9udGFsJztcbiAgICB2YXIgcmVmZXJlbmNlID0gdGFyZ2V0ICE9PSBkcm9wVGFyZ2V0ID8gaW5zaWRlKCkgOiBvdXRzaWRlKCk7XG4gICAgcmV0dXJuIHJlZmVyZW5jZTtcblxuICAgIGZ1bmN0aW9uIG91dHNpZGUgKCkgeyAvLyBzbG93ZXIsIGJ1dCBhYmxlIHRvIGZpZ3VyZSBvdXQgYW55IHBvc2l0aW9uXG4gICAgICB2YXIgbGVuID0gZHJvcFRhcmdldC5jaGlsZHJlbi5sZW5ndGg7XG4gICAgICB2YXIgaTtcbiAgICAgIHZhciBlbDtcbiAgICAgIHZhciByZWN0O1xuICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIGVsID0gZHJvcFRhcmdldC5jaGlsZHJlbltpXTtcbiAgICAgICAgcmVjdCA9IGVsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICBpZiAoaG9yaXpvbnRhbCAmJiAocmVjdC5sZWZ0ICsgcmVjdC53aWR0aCAvIDIpID4geCkgeyByZXR1cm4gZWw7IH1cbiAgICAgICAgaWYgKCFob3Jpem9udGFsICYmIChyZWN0LnRvcCArIHJlY3QuaGVpZ2h0IC8gMikgPiB5KSB7IHJldHVybiBlbDsgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW5zaWRlICgpIHsgLy8gZmFzdGVyLCBidXQgb25seSBhdmFpbGFibGUgaWYgZHJvcHBlZCBpbnNpZGUgYSBjaGlsZCBlbGVtZW50XG4gICAgICB2YXIgcmVjdCA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGlmIChob3Jpem9udGFsKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHggPiByZWN0LmxlZnQgKyBnZXRSZWN0V2lkdGgocmVjdCkgLyAyKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXNvbHZlKHkgPiByZWN0LnRvcCArIGdldFJlY3RIZWlnaHQocmVjdCkgLyAyKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNvbHZlIChhZnRlcikge1xuICAgICAgcmV0dXJuIGFmdGVyID8gbmV4dEVsKHRhcmdldCkgOiB0YXJnZXQ7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gb25Nb3VzZU1vdmUoZSkge1xuICAgICAgICB2YXIgeSA9IGdldENvb3JkKCdwYWdlWScsIGUpO1xuICAgICAgICB2YXIgeCA9IGdldENvb3JkKCdwYWdlWCcsIGUpO1xuICAgICAgICBkcmFrZS5wcmV2aW91c1ggPSB4O1xuICAgICAgICBkcmFrZS5wcmV2aW91c1kgPSB5O1xuXG4gICAgICAgIGlmIChkcmFrZS5kcmFnZ2luZykge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkcmFrZS5jb250YWluZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGRyYWtlLmNvbnRhaW5lcnNbaV07XG4gICAgICAgICAgICAgICAgdmFyIHJlY3QgPSBjb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgICAgICAgICAgICAgICB2YXIgbGVmdFRyaWdnZXJDb250YWluZXIgPSB7XG4gICAgICAgICAgICAgICAgICAgIHRvcDogcmVjdC50b3AsXG4gICAgICAgICAgICAgICAgICAgIHJpZ2h0OiByZWN0LmxlZnQgKyBvLnNjcm9sbFRyaWdnZXJMZWZ0LFxuICAgICAgICAgICAgICAgICAgICBib3R0b206IHJlY3QuYm90dG9tLFxuICAgICAgICAgICAgICAgICAgICBsZWZ0OiByZWN0LmxlZnRcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgdmFyIHJpZ2h0VHJpZ2dlckNvbnRhaW5lciA9IHtcbiAgICAgICAgICAgICAgICAgICAgdG9wOiByZWN0LnRvcCxcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQ6IHJlY3QucmlnaHQsXG4gICAgICAgICAgICAgICAgICAgIGJvdHRvbTogcmVjdC5ib3R0b20sXG4gICAgICAgICAgICAgICAgICAgIGxlZnQ6IHJlY3QucmlnaHQgLSBvLnNjcm9sbFRyaWdnZXJSaWdodFxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICB2YXIgdG9wVHJpZ2dlckNvbnRhaW5lciA9IHtcbiAgICAgICAgICAgICAgICAgICAgdG9wOiByZWN0LnRvcCxcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQ6IHJlY3QucmlnaHQsXG4gICAgICAgICAgICAgICAgICAgIGJvdHRvbTogcmVjdC50b3AgKyBvLnNjcm9sbFRyaWdnZXJUb3AsXG4gICAgICAgICAgICAgICAgICAgIGxlZnQ6IHJlY3QubGVmdFxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICB2YXIgYm90dG9tVHJpZ2dlckNvbnRhaW5lciA9IHtcbiAgICAgICAgICAgICAgICAgICAgdG9wOiByZWN0LmJvdHRvbSAtIG8uc2Nyb2xsVHJpZ2dlclRvcCxcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQ6IHJlY3QucmlnaHQsXG4gICAgICAgICAgICAgICAgICAgIGJvdHRvbTogcmVjdC5ib3R0b20sXG4gICAgICAgICAgICAgICAgICAgIGxlZnQ6IHJlY3QubGVmdFxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICBpZiAoeSA+PSBsZWZ0VHJpZ2dlckNvbnRhaW5lci50b3AgJiYgeSA8PSBsZWZ0VHJpZ2dlckNvbnRhaW5lci5ib3R0b20gJiYgeCA+PSBsZWZ0VHJpZ2dlckNvbnRhaW5lci5sZWZ0ICYmIHggPD0gbGVmdFRyaWdnZXJDb250YWluZXIucmlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsTGVmdChjb250YWluZXIsIHgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoeSA+PSByaWdodFRyaWdnZXJDb250YWluZXIudG9wICYmIHkgPD0gcmlnaHRUcmlnZ2VyQ29udGFpbmVyLmJvdHRvbSAmJiB4ID49IHJpZ2h0VHJpZ2dlckNvbnRhaW5lci5sZWZ0ICYmIHggPD0gcmlnaHRUcmlnZ2VyQ29udGFpbmVyLnJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbFJpZ2h0KGNvbnRhaW5lciwgeCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh5ID49IHRvcFRyaWdnZXJDb250YWluZXIudG9wICYmIHkgPD0gdG9wVHJpZ2dlckNvbnRhaW5lci5ib3R0b20gJiYgeCA+PSB0b3BUcmlnZ2VyQ29udGFpbmVyLmxlZnQgJiYgeCA8PSB0b3BUcmlnZ2VyQ29udGFpbmVyLnJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbFVwKGNvbnRhaW5lciwgeSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh5ID49IGJvdHRvbVRyaWdnZXJDb250YWluZXIudG9wICYmIHkgPD0gYm90dG9tVHJpZ2dlckNvbnRhaW5lci5ib3R0b20gJiYgeCA+PSBib3R0b21UcmlnZ2VyQ29udGFpbmVyLmxlZnQgJiYgeCA8PSBib3R0b21UcmlnZ2VyQ29udGFpbmVyLnJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbERvd24oY29udGFpbmVyLCB5KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzY3JvbGxSaWdodChjb250YWluZXIsIHgpIHtcbiAgICAgICAgaWYgKHggPT09IGRyYWtlLnByZXZpb3VzWCkge1xuICAgICAgICAgICAgY29udGFpbmVyLnNjcm9sbExlZnQgKz0gNTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoc2Nyb2xsUmlnaHQuYmluZCh0aGlzLCBjb250YWluZXIsIHgpLCAyMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzY3JvbGxMZWZ0KGNvbnRhaW5lciwgeCkge1xuICAgICAgICBpZiAoeCA9PT0gZHJha2UucHJldmlvdXNYKSB7XG4gICAgICAgICAgICBjb250YWluZXIuc2Nyb2xsTGVmdCAtPSA1O1xuICAgICAgICAgICAgc2V0VGltZW91dChzY3JvbGxMZWZ0LmJpbmQodGhpcywgY29udGFpbmVyLCB4KSwgMjApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2Nyb2xsVXAoY29udGFpbmVyLCB5KSB7XG4gICAgICAgIGlmICh5ID09PSBkcmFrZS5wcmV2aW91c1kpIHtcbiAgICAgICAgICAgIGNvbnRhaW5lci5zY3JvbGxUb3AgLT0gNTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoc2Nyb2xsVXAuYmluZCh0aGlzLCBjb250YWluZXIsIHkpLCAyMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzY3JvbGxEb3duKGNvbnRhaW5lciwgeSkge1xuICAgICAgICBpZiAoeSA9PT0gZHJha2UucHJldmlvdXNZKSB7XG4gICAgICAgICAgICBjb250YWluZXIuc2Nyb2xsVG9wICs9IDU7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KHNjcm9sbERvd24uYmluZCh0aGlzLCBjb250YWluZXIsIHkpLCAyMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgZnVuY3Rpb24gaXNDb3B5IChpdGVtLCBjb250YWluZXIpIHtcbiAgICByZXR1cm4gdHlwZW9mIG8uY29weSA9PT0gJ2Jvb2xlYW4nID8gby5jb3B5IDogby5jb3B5KGl0ZW0sIGNvbnRhaW5lcik7XG4gIH1cbn1cblxuZnVuY3Rpb24gdG91Y2h5IChlbCwgb3AsIHR5cGUsIGZuKSB7XG4gIHZhciB0b3VjaCA9IHtcbiAgICBtb3VzZXVwOiAndG91Y2hlbmQnLFxuICAgIG1vdXNlZG93bjogJ3RvdWNoc3RhcnQnLFxuICAgIG1vdXNlbW92ZTogJ3RvdWNobW92ZSdcbiAgfTtcbiAgdmFyIHBvaW50ZXJzID0ge1xuICAgIG1vdXNldXA6ICdwb2ludGVydXAnLFxuICAgIG1vdXNlZG93bjogJ3BvaW50ZXJkb3duJyxcbiAgICBtb3VzZW1vdmU6ICdwb2ludGVybW92ZSdcbiAgfTtcbiAgdmFyIG1pY3Jvc29mdCA9IHtcbiAgICBtb3VzZXVwOiAnTVNQb2ludGVyVXAnLFxuICAgIG1vdXNlZG93bjogJ01TUG9pbnRlckRvd24nLFxuICAgIG1vdXNlbW92ZTogJ01TUG9pbnRlck1vdmUnXG4gIH07XG4gIGlmIChnbG9iYWwubmF2aWdhdG9yLnBvaW50ZXJFbmFibGVkKSB7XG4gICAgY3Jvc3N2ZW50W29wXShlbCwgcG9pbnRlcnNbdHlwZV0sIGZuKTtcbiAgfSBlbHNlIGlmIChnbG9iYWwubmF2aWdhdG9yLm1zUG9pbnRlckVuYWJsZWQpIHtcbiAgICBjcm9zc3ZlbnRbb3BdKGVsLCBtaWNyb3NvZnRbdHlwZV0sIGZuKTtcbiAgfSBlbHNlIHtcbiAgICBjcm9zc3ZlbnRbb3BdKGVsLCB0b3VjaFt0eXBlXSwgZm4pO1xuICAgIGNyb3NzdmVudFtvcF0oZWwsIHR5cGUsIGZuKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB3aGljaE1vdXNlQnV0dG9uIChlKSB7XG4gIGlmIChlLnRvdWNoZXMgIT09IHZvaWQgMCkgeyByZXR1cm4gZS50b3VjaGVzLmxlbmd0aDsgfVxuICBpZiAoZS53aGljaCAhPT0gdm9pZCAwICYmIGUud2hpY2ggIT09IDApIHsgcmV0dXJuIGUud2hpY2g7IH0gLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9kcmFndWxhL2lzc3Vlcy8yNjFcbiAgaWYgKGUuYnV0dG9ucyAhPT0gdm9pZCAwKSB7IHJldHVybiBlLmJ1dHRvbnM7IH1cbiAgdmFyIGJ1dHRvbiA9IGUuYnV0dG9uO1xuICBpZiAoYnV0dG9uICE9PSB2b2lkIDApIHsgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9qcXVlcnkvanF1ZXJ5L2Jsb2IvOTllOGZmMWJhYTdhZTM0MWU5NGJiODljM2U4NDU3MGM3YzNhZDllYS9zcmMvZXZlbnQuanMjTDU3My1MNTc1XG4gICAgcmV0dXJuIGJ1dHRvbiAmIDEgPyAxIDogYnV0dG9uICYgMiA/IDMgOiAoYnV0dG9uICYgNCA/IDIgOiAwKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRPZmZzZXQgKGVsKSB7XG4gIHZhciByZWN0ID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIHJldHVybiB7XG4gICAgbGVmdDogcmVjdC5sZWZ0ICsgZ2V0U2Nyb2xsKCdzY3JvbGxMZWZ0JywgJ3BhZ2VYT2Zmc2V0JyksXG4gICAgdG9wOiByZWN0LnRvcCArIGdldFNjcm9sbCgnc2Nyb2xsVG9wJywgJ3BhZ2VZT2Zmc2V0JylcbiAgfTtcbn1cblxuZnVuY3Rpb24gZ2V0U2Nyb2xsIChzY3JvbGxQcm9wLCBvZmZzZXRQcm9wKSB7XG4gIGlmICh0eXBlb2YgZ2xvYmFsW29mZnNldFByb3BdICE9PSAndW5kZWZpbmVkJykge1xuICAgIHJldHVybiBnbG9iYWxbb2Zmc2V0UHJvcF07XG4gIH1cbiAgaWYgKGRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHQpIHtcbiAgICByZXR1cm4gZG9jdW1lbnRFbGVtZW50W3Njcm9sbFByb3BdO1xuICB9XG4gIHJldHVybiBkb2MuYm9keVtzY3JvbGxQcm9wXTtcbn1cblxuZnVuY3Rpb24gZ2V0RWxlbWVudEJlaGluZFBvaW50IChwb2ludCwgeCwgeSkge1xuICB2YXIgcCA9IHBvaW50IHx8IHt9O1xuICB2YXIgc3RhdGUgPSBwLmNsYXNzTmFtZTtcbiAgdmFyIGVsO1xuICBwLmNsYXNzTmFtZSArPSAnIGd1LWhpZGUnO1xuICBlbCA9IGRvYy5lbGVtZW50RnJvbVBvaW50KHgsIHkpO1xuICBwLmNsYXNzTmFtZSA9IHN0YXRlO1xuICByZXR1cm4gZWw7XG59XG5cbmZ1bmN0aW9uIG5ldmVyICgpIHsgcmV0dXJuIGZhbHNlOyB9XG5mdW5jdGlvbiBhbHdheXMgKCkgeyByZXR1cm4gdHJ1ZTsgfVxuZnVuY3Rpb24gZ2V0UmVjdFdpZHRoIChyZWN0KSB7IHJldHVybiByZWN0LndpZHRoIHx8IChyZWN0LnJpZ2h0IC0gcmVjdC5sZWZ0KTsgfVxuZnVuY3Rpb24gZ2V0UmVjdEhlaWdodCAocmVjdCkgeyByZXR1cm4gcmVjdC5oZWlnaHQgfHwgKHJlY3QuYm90dG9tIC0gcmVjdC50b3ApOyB9XG5mdW5jdGlvbiBnZXRQYXJlbnQgKGVsKSB7IHJldHVybiBlbC5wYXJlbnROb2RlID09PSBkb2MgPyBudWxsIDogZWwucGFyZW50Tm9kZTsgfVxuZnVuY3Rpb24gaXNJbnB1dCAoZWwpIHsgcmV0dXJuIGVsLnRhZ05hbWUgPT09ICdJTlBVVCcgfHwgZWwudGFnTmFtZSA9PT0gJ1RFWFRBUkVBJyB8fCBlbC50YWdOYW1lID09PSAnU0VMRUNUJyB8fCBpc0VkaXRhYmxlKGVsKTsgfVxuZnVuY3Rpb24gaXNFZGl0YWJsZSAoZWwpIHtcbiAgaWYgKCFlbCkgeyByZXR1cm4gZmFsc2U7IH0gLy8gbm8gcGFyZW50cyB3ZXJlIGVkaXRhYmxlXG4gIGlmIChlbC5jb250ZW50RWRpdGFibGUgPT09ICdmYWxzZScpIHsgcmV0dXJuIGZhbHNlOyB9IC8vIHN0b3AgdGhlIGxvb2t1cFxuICBpZiAoZWwuY29udGVudEVkaXRhYmxlID09PSAndHJ1ZScpIHsgcmV0dXJuIHRydWU7IH0gLy8gZm91bmQgYSBjb250ZW50RWRpdGFibGUgZWxlbWVudCBpbiB0aGUgY2hhaW5cbiAgcmV0dXJuIGlzRWRpdGFibGUoZ2V0UGFyZW50KGVsKSk7IC8vIGNvbnRlbnRFZGl0YWJsZSBpcyBzZXQgdG8gJ2luaGVyaXQnXG59XG5cbmZ1bmN0aW9uIG5leHRFbCAoZWwpIHtcbiAgcmV0dXJuIGVsLm5leHRFbGVtZW50U2libGluZyB8fCBtYW51YWxseSgpO1xuICBmdW5jdGlvbiBtYW51YWxseSAoKSB7XG4gICAgdmFyIHNpYmxpbmcgPSBlbDtcbiAgICBkbyB7XG4gICAgICBzaWJsaW5nID0gc2libGluZy5uZXh0U2libGluZztcbiAgICB9IHdoaWxlIChzaWJsaW5nICYmIHNpYmxpbmcubm9kZVR5cGUgIT09IDEpO1xuICAgIHJldHVybiBzaWJsaW5nO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldEV2ZW50SG9zdCAoZSkge1xuICAvLyBvbiB0b3VjaGVuZCBldmVudCwgd2UgaGF2ZSB0byB1c2UgYGUuY2hhbmdlZFRvdWNoZXNgXG4gIC8vIHNlZSBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzcxOTI1NjMvdG91Y2hlbmQtZXZlbnQtcHJvcGVydGllc1xuICAvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2JldmFjcXVhL2RyYWd1bGEvaXNzdWVzLzM0XG4gIGlmIChlLnRhcmdldFRvdWNoZXMgJiYgZS50YXJnZXRUb3VjaGVzLmxlbmd0aCkge1xuICAgIHJldHVybiBlLnRhcmdldFRvdWNoZXNbMF07XG4gIH1cbiAgaWYgKGUuY2hhbmdlZFRvdWNoZXMgJiYgZS5jaGFuZ2VkVG91Y2hlcy5sZW5ndGgpIHtcbiAgICByZXR1cm4gZS5jaGFuZ2VkVG91Y2hlc1swXTtcbiAgfVxuICByZXR1cm4gZTtcbn1cblxuZnVuY3Rpb24gZ2V0Q29vcmQgKGNvb3JkLCBlKSB7XG4gIHZhciBob3N0ID0gZ2V0RXZlbnRIb3N0KGUpO1xuICB2YXIgbWlzc01hcCA9IHtcbiAgICBwYWdlWDogJ2NsaWVudFgnLCAvLyBJRThcbiAgICBwYWdlWTogJ2NsaWVudFknIC8vIElFOFxuICB9O1xuICBpZiAoY29vcmQgaW4gbWlzc01hcCAmJiAhKGNvb3JkIGluIGhvc3QpICYmIG1pc3NNYXBbY29vcmRdIGluIGhvc3QpIHtcbiAgICBjb29yZCA9IG1pc3NNYXBbY29vcmRdO1xuICB9XG4gIHJldHVybiBob3N0W2Nvb3JkXTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBkcmFndWxhO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdGlja3kgPSByZXF1aXJlKCd0aWNreScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGRlYm91bmNlIChmbiwgYXJncywgY3R4KSB7XG4gIGlmICghZm4pIHsgcmV0dXJuOyB9XG4gIHRpY2t5KGZ1bmN0aW9uIHJ1biAoKSB7XG4gICAgZm4uYXBwbHkoY3R4IHx8IG51bGwsIGFyZ3MgfHwgW10pO1xuICB9KTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBhdG9hID0gcmVxdWlyZSgnYXRvYScpO1xudmFyIGRlYm91bmNlID0gcmVxdWlyZSgnLi9kZWJvdW5jZScpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGVtaXR0ZXIgKHRoaW5nLCBvcHRpb25zKSB7XG4gIHZhciBvcHRzID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIGV2dCA9IHt9O1xuICBpZiAodGhpbmcgPT09IHVuZGVmaW5lZCkgeyB0aGluZyA9IHt9OyB9XG4gIHRoaW5nLm9uID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgaWYgKCFldnRbdHlwZV0pIHtcbiAgICAgIGV2dFt0eXBlXSA9IFtmbl07XG4gICAgfSBlbHNlIHtcbiAgICAgIGV2dFt0eXBlXS5wdXNoKGZuKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaW5nO1xuICB9O1xuICB0aGluZy5vbmNlID0gZnVuY3Rpb24gKHR5cGUsIGZuKSB7XG4gICAgZm4uX29uY2UgPSB0cnVlOyAvLyB0aGluZy5vZmYoZm4pIHN0aWxsIHdvcmtzIVxuICAgIHRoaW5nLm9uKHR5cGUsIGZuKTtcbiAgICByZXR1cm4gdGhpbmc7XG4gIH07XG4gIHRoaW5nLm9mZiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgIHZhciBjID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBpZiAoYyA9PT0gMSkge1xuICAgICAgZGVsZXRlIGV2dFt0eXBlXTtcbiAgICB9IGVsc2UgaWYgKGMgPT09IDApIHtcbiAgICAgIGV2dCA9IHt9O1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICBpZiAoIWV0KSB7IHJldHVybiB0aGluZzsgfVxuICAgICAgZXQuc3BsaWNlKGV0LmluZGV4T2YoZm4pLCAxKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaW5nO1xuICB9O1xuICB0aGluZy5lbWl0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgIHJldHVybiB0aGluZy5lbWl0dGVyU25hcHNob3QoYXJncy5zaGlmdCgpKS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfTtcbiAgdGhpbmcuZW1pdHRlclNuYXBzaG90ID0gZnVuY3Rpb24gKHR5cGUpIHtcbiAgICB2YXIgZXQgPSAoZXZ0W3R5cGVdIHx8IFtdKS5zbGljZSgwKTtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIGFyZ3MgPSBhdG9hKGFyZ3VtZW50cyk7XG4gICAgICB2YXIgY3R4ID0gdGhpcyB8fCB0aGluZztcbiAgICAgIGlmICh0eXBlID09PSAnZXJyb3InICYmIG9wdHMudGhyb3dzICE9PSBmYWxzZSAmJiAhZXQubGVuZ3RoKSB7IHRocm93IGFyZ3MubGVuZ3RoID09PSAxID8gYXJnc1swXSA6IGFyZ3M7IH1cbiAgICAgIGV0LmZvckVhY2goZnVuY3Rpb24gZW1pdHRlciAobGlzdGVuKSB7XG4gICAgICAgIGlmIChvcHRzLmFzeW5jKSB7IGRlYm91bmNlKGxpc3RlbiwgYXJncywgY3R4KTsgfSBlbHNlIHsgbGlzdGVuLmFwcGx5KGN0eCwgYXJncyk7IH1cbiAgICAgICAgaWYgKGxpc3Rlbi5fb25jZSkgeyB0aGluZy5vZmYodHlwZSwgbGlzdGVuKTsgfVxuICAgICAgfSk7XG4gICAgICByZXR1cm4gdGhpbmc7XG4gICAgfTtcbiAgfTtcbiAgcmV0dXJuIHRoaW5nO1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gYXRvYSAoYSwgbikgeyByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYSwgbik7IH1cbiIsInZhciBzaSA9IHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicsIHRpY2s7XG5pZiAoc2kpIHtcbiAgdGljayA9IGZ1bmN0aW9uIChmbikgeyBzZXRJbW1lZGlhdGUoZm4pOyB9O1xufSBlbHNlIHtcbiAgdGljayA9IGZ1bmN0aW9uIChmbikgeyBzZXRUaW1lb3V0KGZuLCAwKTsgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB0aWNrOyIsIlxudmFyIE5hdGl2ZUN1c3RvbUV2ZW50ID0gZ2xvYmFsLkN1c3RvbUV2ZW50O1xuXG5mdW5jdGlvbiB1c2VOYXRpdmUgKCkge1xuICB0cnkge1xuICAgIHZhciBwID0gbmV3IE5hdGl2ZUN1c3RvbUV2ZW50KCdjYXQnLCB7IGRldGFpbDogeyBmb286ICdiYXInIH0gfSk7XG4gICAgcmV0dXJuICAnY2F0JyA9PT0gcC50eXBlICYmICdiYXInID09PSBwLmRldGFpbC5mb287XG4gIH0gY2F0Y2ggKGUpIHtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKlxuICogQ3Jvc3MtYnJvd3NlciBgQ3VzdG9tRXZlbnRgIGNvbnN0cnVjdG9yLlxuICpcbiAqIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9DdXN0b21FdmVudC5DdXN0b21FdmVudFxuICpcbiAqIEBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHVzZU5hdGl2ZSgpID8gTmF0aXZlQ3VzdG9tRXZlbnQgOlxuXG4vLyBJRSA+PSA5XG4nZnVuY3Rpb24nID09PSB0eXBlb2YgZG9jdW1lbnQuY3JlYXRlRXZlbnQgPyBmdW5jdGlvbiBDdXN0b21FdmVudCAodHlwZSwgcGFyYW1zKSB7XG4gIHZhciBlID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0N1c3RvbUV2ZW50Jyk7XG4gIGlmIChwYXJhbXMpIHtcbiAgICBlLmluaXRDdXN0b21FdmVudCh0eXBlLCBwYXJhbXMuYnViYmxlcywgcGFyYW1zLmNhbmNlbGFibGUsIHBhcmFtcy5kZXRhaWwpO1xuICB9IGVsc2Uge1xuICAgIGUuaW5pdEN1c3RvbUV2ZW50KHR5cGUsIGZhbHNlLCBmYWxzZSwgdm9pZCAwKTtcbiAgfVxuICByZXR1cm4gZTtcbn0gOlxuXG4vLyBJRSA8PSA4XG5mdW5jdGlvbiBDdXN0b21FdmVudCAodHlwZSwgcGFyYW1zKSB7XG4gIHZhciBlID0gZG9jdW1lbnQuY3JlYXRlRXZlbnRPYmplY3QoKTtcbiAgZS50eXBlID0gdHlwZTtcbiAgaWYgKHBhcmFtcykge1xuICAgIGUuYnViYmxlcyA9IEJvb2xlYW4ocGFyYW1zLmJ1YmJsZXMpO1xuICAgIGUuY2FuY2VsYWJsZSA9IEJvb2xlYW4ocGFyYW1zLmNhbmNlbGFibGUpO1xuICAgIGUuZGV0YWlsID0gcGFyYW1zLmRldGFpbDtcbiAgfSBlbHNlIHtcbiAgICBlLmJ1YmJsZXMgPSBmYWxzZTtcbiAgICBlLmNhbmNlbGFibGUgPSBmYWxzZTtcbiAgICBlLmRldGFpbCA9IHZvaWQgMDtcbiAgfVxuICByZXR1cm4gZTtcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGN1c3RvbUV2ZW50ID0gcmVxdWlyZSgnY3VzdG9tLWV2ZW50Jyk7XG52YXIgZXZlbnRtYXAgPSByZXF1aXJlKCcuL2V2ZW50bWFwJyk7XG52YXIgZG9jID0gZ2xvYmFsLmRvY3VtZW50O1xudmFyIGFkZEV2ZW50ID0gYWRkRXZlbnRFYXN5O1xudmFyIHJlbW92ZUV2ZW50ID0gcmVtb3ZlRXZlbnRFYXN5O1xudmFyIGhhcmRDYWNoZSA9IFtdO1xuXG5pZiAoIWdsb2JhbC5hZGRFdmVudExpc3RlbmVyKSB7XG4gIGFkZEV2ZW50ID0gYWRkRXZlbnRIYXJkO1xuICByZW1vdmVFdmVudCA9IHJlbW92ZUV2ZW50SGFyZDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZDogYWRkRXZlbnQsXG4gIHJlbW92ZTogcmVtb3ZlRXZlbnQsXG4gIGZhYnJpY2F0ZTogZmFicmljYXRlRXZlbnRcbn07XG5cbmZ1bmN0aW9uIGFkZEV2ZW50RWFzeSAoZWwsIHR5cGUsIGZuLCBjYXB0dXJpbmcpIHtcbiAgcmV0dXJuIGVsLmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgZm4sIGNhcHR1cmluZyk7XG59XG5cbmZ1bmN0aW9uIGFkZEV2ZW50SGFyZCAoZWwsIHR5cGUsIGZuKSB7XG4gIHJldHVybiBlbC5hdHRhY2hFdmVudCgnb24nICsgdHlwZSwgd3JhcChlbCwgdHlwZSwgZm4pKTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlRXZlbnRFYXN5IChlbCwgdHlwZSwgZm4sIGNhcHR1cmluZykge1xuICByZXR1cm4gZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlLCBmbiwgY2FwdHVyaW5nKTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlRXZlbnRIYXJkIChlbCwgdHlwZSwgZm4pIHtcbiAgdmFyIGxpc3RlbmVyID0gdW53cmFwKGVsLCB0eXBlLCBmbik7XG4gIGlmIChsaXN0ZW5lcikge1xuICAgIHJldHVybiBlbC5kZXRhY2hFdmVudCgnb24nICsgdHlwZSwgbGlzdGVuZXIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGZhYnJpY2F0ZUV2ZW50IChlbCwgdHlwZSwgbW9kZWwpIHtcbiAgdmFyIGUgPSBldmVudG1hcC5pbmRleE9mKHR5cGUpID09PSAtMSA/IG1ha2VDdXN0b21FdmVudCgpIDogbWFrZUNsYXNzaWNFdmVudCgpO1xuICBpZiAoZWwuZGlzcGF0Y2hFdmVudCkge1xuICAgIGVsLmRpc3BhdGNoRXZlbnQoZSk7XG4gIH0gZWxzZSB7XG4gICAgZWwuZmlyZUV2ZW50KCdvbicgKyB0eXBlLCBlKTtcbiAgfVxuICBmdW5jdGlvbiBtYWtlQ2xhc3NpY0V2ZW50ICgpIHtcbiAgICB2YXIgZTtcbiAgICBpZiAoZG9jLmNyZWF0ZUV2ZW50KSB7XG4gICAgICBlID0gZG9jLmNyZWF0ZUV2ZW50KCdFdmVudCcpO1xuICAgICAgZS5pbml0RXZlbnQodHlwZSwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfSBlbHNlIGlmIChkb2MuY3JlYXRlRXZlbnRPYmplY3QpIHtcbiAgICAgIGUgPSBkb2MuY3JlYXRlRXZlbnRPYmplY3QoKTtcbiAgICB9XG4gICAgcmV0dXJuIGU7XG4gIH1cbiAgZnVuY3Rpb24gbWFrZUN1c3RvbUV2ZW50ICgpIHtcbiAgICByZXR1cm4gbmV3IGN1c3RvbUV2ZW50KHR5cGUsIHsgZGV0YWlsOiBtb2RlbCB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiB3cmFwcGVyRmFjdG9yeSAoZWwsIHR5cGUsIGZuKSB7XG4gIHJldHVybiBmdW5jdGlvbiB3cmFwcGVyIChvcmlnaW5hbEV2ZW50KSB7XG4gICAgdmFyIGUgPSBvcmlnaW5hbEV2ZW50IHx8IGdsb2JhbC5ldmVudDtcbiAgICBlLnRhcmdldCA9IGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudDtcbiAgICBlLnByZXZlbnREZWZhdWx0ID0gZS5wcmV2ZW50RGVmYXVsdCB8fCBmdW5jdGlvbiBwcmV2ZW50RGVmYXVsdCAoKSB7IGUucmV0dXJuVmFsdWUgPSBmYWxzZTsgfTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbiA9IGUuc3RvcFByb3BhZ2F0aW9uIHx8IGZ1bmN0aW9uIHN0b3BQcm9wYWdhdGlvbiAoKSB7IGUuY2FuY2VsQnViYmxlID0gdHJ1ZTsgfTtcbiAgICBlLndoaWNoID0gZS53aGljaCB8fCBlLmtleUNvZGU7XG4gICAgZm4uY2FsbChlbCwgZSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHdyYXAgKGVsLCB0eXBlLCBmbikge1xuICB2YXIgd3JhcHBlciA9IHVud3JhcChlbCwgdHlwZSwgZm4pIHx8IHdyYXBwZXJGYWN0b3J5KGVsLCB0eXBlLCBmbik7XG4gIGhhcmRDYWNoZS5wdXNoKHtcbiAgICB3cmFwcGVyOiB3cmFwcGVyLFxuICAgIGVsZW1lbnQ6IGVsLFxuICAgIHR5cGU6IHR5cGUsXG4gICAgZm46IGZuXG4gIH0pO1xuICByZXR1cm4gd3JhcHBlcjtcbn1cblxuZnVuY3Rpb24gdW53cmFwIChlbCwgdHlwZSwgZm4pIHtcbiAgdmFyIGkgPSBmaW5kKGVsLCB0eXBlLCBmbik7XG4gIGlmIChpKSB7XG4gICAgdmFyIHdyYXBwZXIgPSBoYXJkQ2FjaGVbaV0ud3JhcHBlcjtcbiAgICBoYXJkQ2FjaGUuc3BsaWNlKGksIDEpOyAvLyBmcmVlIHVwIGEgdGFkIG9mIG1lbW9yeVxuICAgIHJldHVybiB3cmFwcGVyO1xuICB9XG59XG5cbmZ1bmN0aW9uIGZpbmQgKGVsLCB0eXBlLCBmbikge1xuICB2YXIgaSwgaXRlbTtcbiAgZm9yIChpID0gMDsgaSA8IGhhcmRDYWNoZS5sZW5ndGg7IGkrKykge1xuICAgIGl0ZW0gPSBoYXJkQ2FjaGVbaV07XG4gICAgaWYgKGl0ZW0uZWxlbWVudCA9PT0gZWwgJiYgaXRlbS50eXBlID09PSB0eXBlICYmIGl0ZW0uZm4gPT09IGZuKSB7XG4gICAgICByZXR1cm4gaTtcbiAgICB9XG4gIH1cbn1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGV2ZW50bWFwID0gW107XG52YXIgZXZlbnRuYW1lID0gJyc7XG52YXIgcm9uID0gL15vbi87XG5cbmZvciAoZXZlbnRuYW1lIGluIGdsb2JhbCkge1xuICBpZiAocm9uLnRlc3QoZXZlbnRuYW1lKSkge1xuICAgIGV2ZW50bWFwLnB1c2goZXZlbnRuYW1lLnNsaWNlKDIpKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGV2ZW50bWFwO1xuIl19
