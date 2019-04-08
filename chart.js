const e10 = Math.sqrt(50);
const e5 = Math.sqrt(10);
const e2 = Math.sqrt(2);

function tickIncrement(start, stop, count) {
  const step = (stop - start) / Math.max(0, count);
  const power = Math.floor(Math.log(step) / Math.LN10);
  const error = step / Math.pow(10, power);
  const result = error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1;

  if (power >= 0) {
    return Math.pow(10, power) * result;
  }

  return -Math.pow(10, -power) / result;
}

const DURATION = 300;

// for creating svg elements
const createElementNS = (tag, attrs = {}) => {
  const elem = document.createElementNS(svgNS, tag);

  for (let attr in attrs) {
    if (attrs.hasOwnProperty(attr)) {
      elem.setAttribute(attr, attrs[attr]);
    }
  }

  return elem;
};

// for creating elements without namespaces
const createElement = (tag, attrs = {}) => {
  const elem = document.createElement(tag);

  for (let attr in attrs) {
    if (attrs.hasOwnProperty(attr)) {
      elem.setAttribute(attr, attrs[attr]);
    }
  }

  return elem;
};

const ease = CubicBezier(0.25, 0.1, 0.25, 1.0);
const linear = t => t;

const svgNS = 'http://www.w3.org/2000/svg';
const findMaximum = array => array.reduce((acc, item) => item > acc ? item : acc, -Infinity);
const findMinimum = array => array.reduce((acc, item) => item < acc ? item : acc, Infinity);
const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];
const weeks = [
  'Sun',
  'Mon',
  'Tue',
  'Wen',
  'Thu',
  'Fri',
  'Sat'
];

class TelegramChart {
  constructor(selector, url = '', params = {name: 'Default chart'}) {
    this.container = createElement('div');
    this.container.classList.add('chart');
    this.container.style.width = '100%';
    selector.appendChild(this.container);

    this.title = createElement('p');
    this.title.classList.add('chart__title');
    this.title.innerText = params.title;
    this.container.appendChild(this.title);

    this.url = url;
    this.params = params;
    this.chartPadding = 10;

    this.dimensions = {
      width: this.params.width || this.container.clientWidth,
      height: this.params.height || this.container.clientHeight,
      chartHeight: (this.params.height || this.container.clientHeight) - 25,
      chartWidth: (this.params.width || this.container.clientWidth) - this.chartPadding * 2,
      offsetHeight: 38
    };

    this.offsetDrag = {
      mainDrag: null,
      leftDrag: null,
      rightDrag: null,
      leftSpacer: null,
      rightSpacer: null
    };

    this.createViewport();
    this.createOffsetWrapper();

    this.setDimensions();
    // this.createDefs();

    this.infoViewport = null; // viewport for info window
    this.xTicksCount = 0; // count of y ticks
    this.yTicksCount = 0; // count of y ticks
    this.selectedX = -1; // selected x coord for info window
    this.offsetLeft = 0; // zoom lower limit
    this.offsetRight = 0.3; // zoom upper limit
    this.maximum = 0; // maximum y coord
    this.minimum = 0; // minimum y coord
    this.zoomRatio = 1; // zoom ratio for main chart
    this.offsetMaximum = 0; // maximum y coord for zoom chart
    this.offsetMinimum = 0; // minimum y coord for zoom chart
    this.globalMaximum = 0; // maximum y coord for zoom chart
    this.globalMinimum = 0; // minimum y coord for zoom chart

    // styles
    // this.pixelRatio = window.devicePixelRatio;
    this.pixelRatio = 1;
    this.mainLineWidth = 2 * this.pixelRatio;
    this.gridLineWidth = 1 * this.pixelRatio;

    this.needRedraw = true;

    this.infoData = {
      xLine: null,
      xInfoG: null,
      xInfoRect: null,
      weekLabel: null,
      circles: new Map(),
      values: {
        wrapper: null,
        values: new Map()
      }
    };

    this.xTicks = new Map();
    this.yTicks = new Map();

    this.xAxis = [];
    this.lines = [];

    const resizeEvent = () => {
      this.setDimensions();

      this.createOffsetLines();
      this.render();
    };
    if ('ResizeObserver' in window) {

      const ro = new ResizeObserver(resizeEvent);
      ro.observe(document.body);

    } else {
      window.addEventListener('resize', resizeEvent);
    }

    // this.createInfo();
    this.getData(this.url);

    console.log(this);
  }

  getData(url) {
    if (!url) {
      throw new Error('Url is invalid');
    }

    fetch(url)
      .then(response => response.json())
      .then(data => {
        this.xAxis = data.columns.find(column => data.types[column[0]] === 'x').slice(1);
        this.lines = data.columns.filter(column => data.types[column[0]] === 'line').map(line => {
          const id = line[0];

          return {
            id,
            name: data.names[id],
            data: line.slice(1),
            color: data.colors[id],
            opacity: this.createAnimation(1, DURATION),
            offsetViewport: null,
            maximum: 0,
            minimum: 0,
            visible: true
          };
        });
        this.yScaled = data.y_scaled;

        this.findMaximumAndMinimum();
        this.findOffsetMaximumAndMinimum();
        this.findGlobalMaximumAndMinimum();

        this.createOffsetLines();
        this.createToggleCheckboxes();
        this.render();

        requestAnimationFrame(() => this.renderCanvas());
      })
  }

  createAnimation(value, duration = DURATION, easing = ease) {
    return {
      from: value,
      to: value,
      value,
      start: 0,
      duration,
      easing
    };
  }

  animate(animation, to) {
    animation.to = to;
    animation.from = animation.value;
    animation.start = Date.now();
  }

  updateAnimation(animation) {
    const {from, to, value, start, duration, easing} = animation;
    if (to === value) {
      return;
    }

    let p = (Date.now() - start) / duration;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    const result = easing(p);

    animation.value = from - (from - to) * result;

    return true;
  }

  createViewport() {
    this.viewport = createElement('canvas');
    this.viewport.classList.add('chart__viewport');
    this.container.appendChild(this.viewport);

    this.context = this.viewport.getContext('2d');

    this.viewport.addEventListener('mousemove', e => {
      e.stopPropagation();

      const selectedX = Math.round((this.offsetLeft + e.clientX / (this.chartPadding + this.dimensions.chartWidth) * (this.offsetRight - this.offsetLeft)) * (this.xAxis.length - 1));

      if (selectedX === this.selectedX) {
        return;
      }

      this.selectedX = selectedX;

      // this.renderInfo();
    });

    document.addEventListener('mousemove', () => {
      this.selectedX = -1;

      if (this.infoViewport) {
        this.infoViewport.style.opacity = '0';
      }
    })
  }

  createDefs() {
    this.defs = createElementNS('defs');

    const infoFilter = createElementNS('filter', {
      id: 'info-filter'
    });

    const feDropShadow = createElementNS('feDropShadow', {
      in: 'SourceGraphic',
      'flood-color': '#000000',
      'flood-opacity': '0.25',
      stdDeviation: '1',
      dx: '0',
      dy: '0.5',
      result: 'dropShadow'
    });

    const clipPath = createElementNS('clipPath', {
      id: 'lines-clip'
    });

    const clipRect = createElementNS('rect', {
      x: '0',
      y: '0',
      width: this.dimensions.width,
      height: this.dimensions.chartHeight
    });

    clipPath.appendChild(clipRect);

    infoFilter.appendChild(feDropShadow);
    this.defs.appendChild(clipPath);
    this.defs.appendChild(infoFilter);
    this.viewport.appendChild(this.defs);
  }

  createOffsetWrapper() {
    this.offsetContainer = createElement('div');
    this.offsetContainer.classList.add('chart__offset-container');
    this.offsetContainer.style.padding = `0 ${this.chartPadding}px`;
    this.container.appendChild(this.offsetContainer);

    this.offsetWrapper = createElementNS('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      'xmlns:xlink': 'http://www.w3.org/1999/xlink'
    });
    this.offsetWrapper.classList.add('chart__offset-wrapper');
    this.offsetContainer.appendChild(this.offsetWrapper);

    this.offsetDrag.mainDrag = createElementNS('rect', {
      fill: 'transparent',
      height: this.dimensions.offsetHeight
    });
    this.offsetDrag.mainDrag.classList.add('chart__offset-main-drag');
    this.offsetWrapper.appendChild(this.offsetDrag.mainDrag);

    this.offsetDrag.leftDrag = createElementNS('rect', {
      width: '3',
      height: this.dimensions.offsetHeight
    });
    this.offsetDrag.leftDrag.classList.add('chart__offset-drag');
    this.offsetDrag.leftDrag.classList.add('chart__offset-drag_left');
    this.offsetWrapper.appendChild(this.offsetDrag.leftDrag);

    this.offsetDrag.rightDrag = createElementNS('rect', {
      width: '3',
      height: this.dimensions.offsetHeight
    });
    this.offsetDrag.rightDrag.classList.add('chart__offset-drag');
    this.offsetDrag.rightDrag.classList.add('chart__offset-drag_right');
    this.offsetWrapper.appendChild(this.offsetDrag.rightDrag);

    this.offsetLinesWrapper = createElementNS('g', {
      fill: 'none',
      'stroke-width': '1',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    });
    this.offsetLinesWrapper.classList.add('chart__offset-line-wrapper');
    this.offsetWrapper.appendChild(this.offsetLinesWrapper);
    this.offsetLinesWrapper.style.transformOrigin = `left ${this.dimensions.offsetHeight}px`;

    this.offsetDrag.leftSpacer = createElementNS('rect', {
      x: '0',
      height: this.dimensions.offsetHeight
    });
    this.offsetDrag.leftSpacer.classList.add('chart__offset-spacer');
    this.offsetDrag.leftSpacer.classList.add('chart__offset-spacer_left');
    this.offsetWrapper.appendChild(this.offsetDrag.leftSpacer);

    this.offsetDrag.rightSpacer = createElementNS('rect', {
      height: this.dimensions.offsetHeight
    });
    this.offsetDrag.rightSpacer.classList.add('chart__offset-spacer');
    this.offsetDrag.rightSpacer.classList.add('chart__offset-spacer_right');
    this.offsetWrapper.appendChild(this.offsetDrag.rightSpacer);

    this.attachMouseEvents();
  }

  attachMouseEvents() {
    let leftDragging = false;
    let rightDragging = false;
    let leftCoordinate = 0;
    let rightCoordinate = 0;
    let safetyZone = 10;
    let offsetBorder = 0.07;

    const mouseDownHandler = e => {
      this.selectedX = -1;
      const x = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;

      if ((x >= this.chartPadding + this.offsetLeft * this.dimensions.chartWidth - safetyZone) && (x < this.chartPadding + this.offsetRight * this.dimensions.chartWidth - safetyZone)) {
        e.stopPropagation();
        leftDragging = true;
        leftCoordinate = x - this.offsetLeft * this.dimensions.chartWidth;
      }
      if ((x > this.chartPadding + this.offsetLeft * this.dimensions.chartWidth + safetyZone) && (x <= this.chartPadding + this.offsetRight * this.dimensions.chartWidth + safetyZone)) {
        e.stopPropagation();
        rightDragging = true;
        rightCoordinate = x - this.offsetRight * this.dimensions.chartWidth;
      }
    };
    const mouseUpHandler = () => {
      leftDragging = false;
      rightDragging = false;
      leftCoordinate = 0;
      rightCoordinate = 0;
    };
    const mouseMoveHandler = e => {
      if (leftDragging || rightDragging) {
        e.stopPropagation();

        const x = e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientX : e.clientX;

        if (leftDragging) {
          let newLeft = x - leftCoordinate;

          this.offsetLeft = newLeft / this.dimensions.chartWidth;
        }

        if (rightDragging) {
          let newRight = x - rightCoordinate;

          this.offsetRight = newRight / this.dimensions.chartWidth;
        }

        if (this.offsetRight - this.offsetLeft < offsetBorder) {
          if (leftDragging) {
            this.offsetRight = this.offsetLeft + offsetBorder;
          } else if (rightDragging) {
            this.offsetLeft = this.offsetRight - offsetBorder;
          }
        }

        if (this.offsetRight < offsetBorder) {
          this.offsetRight = offsetBorder;
        }

        if (this.offsetRight > 1) {
          this.offsetRight = 1;
        }

        if (this.offsetLeft < 0) {
          this.offsetLeft = 0;
        }

        if (this.offsetLeft > 1 - offsetBorder) {
          this.offsetLeft = 1 - offsetBorder;
        }

        this.render();
      }
    };

    if ('ontouchstart' in window) {
      this.offsetWrapper.addEventListener('touchstart', e => mouseDownHandler(e));
      this.offsetContainer.addEventListener('touchmove', e => mouseMoveHandler(e));
      document.addEventListener('touchend', () => mouseUpHandler());
    } else {
      this.offsetWrapper.addEventListener('mousedown', e => mouseDownHandler(e));
      this.offsetContainer.addEventListener('mousemove', e => mouseMoveHandler(e));
      document.addEventListener('mouseup', () => mouseUpHandler());
    }
  }

  createToggleCheckboxes() {
    const checkboxContainer = createElement('div');
    checkboxContainer.classList.add('chart__checks');
    this.offsetContainer.appendChild(checkboxContainer);

    this.lines.forEach(line => {
      const label = createElement('label');
      const checkbox = createElement('input', {
        type: 'checkbox',
        checked: line.visible
      });
      const text = createElement('span');
      const icon = createElement('div');

      label.classList.add('chart__toggle-check');
      text.innerText = line.name;
      icon.style.backgroundColor = line.color;
      icon.classList.add('chart__toggle-check-icon');

      if (!line.visible) {
        label.classList.add('chart__toggle-check_disabled');
      }

      checkbox.addEventListener('change', () => this.toggleLine(label, line));

      label.appendChild(checkbox);
      label.appendChild(icon);
      label.appendChild(text);
      checkboxContainer.appendChild(label);
    });
  }

  createInfo() {
    if (this.infoViewport) {
      return;
    }

    this.infoViewport = createElementNS('g');
    this.infoViewport.classList.add('chart__info-viewport');

    this.infoData.xLine = createElementNS('line', {
      y1: '3px',
      y2: this.dimensions.chartHeight + 'px',
      x1: '0',
      x2: '0',
      'stroke-width': '1px'
    });
    this.infoData.xLine.classList.add('chart__info-line');
    this.infoViewport.appendChild(this.infoData.xLine);

    this.infoData.xInfoG = createElementNS('g');
    this.infoData.xInfoG.classList.add('chart__info-wrapper');

    this.lines.forEach(line => {
      const lineCircle = createElementNS('circle', {
        r: '4px',
        cx: '0',
        stroke: line.color,
        'stroke-width': '2px'
      });
      lineCircle.classList.add('chart__info-circle');

      this.infoData.circles.set(line.id, lineCircle);
      this.infoViewport.appendChild(lineCircle);
    });

    this.infoViewport.appendChild(this.infoData.xInfoG);

    this.infoData.xInfoRect = createElementNS('rect', {
      'stroke-width': '1px',
      rx: '5',
      ry: '5',
      y: '1px',
      x: '-25px'
    });
    this.infoData.xInfoRect.classList.add('chart__info-rect');
    this.infoData.xInfoG.appendChild(this.infoData.xInfoRect);

    this.infoData.weekLabel = createElementNS('text', {
      fill: 'black',
      y: '19px',
      x: '-17px'
    });
    this.infoData.weekLabel.classList.add('chart__info-week');
    this.infoData.xInfoG.appendChild(this.infoData.weekLabel);

    this.infoData.values.wrapper = createElementNS('g');
    this.infoData.values.wrapper.classList.add('chart__info-values');
    this.infoData.xInfoG.appendChild(this.infoData.values.wrapper);

    this.viewport.appendChild(this.infoViewport);
  }

  renderOffsets() {
    const {mainDrag, leftDrag, rightDrag, leftSpacer, rightSpacer} = this.offsetDrag;

    const leftOffset = this.dimensions.width * this.offsetLeft;
    const rightOffset = this.dimensions.width * this.offsetRight;
    const width = rightOffset - leftOffset;

    leftDrag.setAttribute('x', leftOffset);
    mainDrag.setAttribute('x', leftOffset);
    mainDrag.setAttribute('width', width);
    rightDrag.setAttribute('x', rightOffset - 3);
    leftSpacer.setAttribute('width', leftOffset);
    rightSpacer.setAttribute('x', rightOffset);
    rightSpacer.setAttribute('width', this.dimensions.width - rightOffset);
  }

  findMaximumAndMinimum() {
    const oldMaximum = this.maximum;
    const oldMinimum = this.minimum;
    const start = Math.floor(this.offsetLeft * this.xAxis.length);
    const end = Math.ceil(this.offsetRight * this.xAxis.length);

    this.maximum = -Infinity;
    this.minimum = Infinity;

    for (let l = 0; l < this.lines.length; l++) {
      if (!this.lines[l].visible) {
        continue;
      }
      let lineMaximum = -Infinity;
      let lineMinimum = Infinity;
      const oldLineMaximum = this.lines[l].maximum;
      const oldLineMinimum = this.lines[l].minimum;

      for (let i = start; i < end; i++) {
        if (this.lines[l].data[i] > lineMaximum) {
          lineMaximum = this.lines[l].data[i];
        } else if (this.lines[l].data[i] < lineMinimum) {
          lineMinimum = this.lines[l].data[i];
        }
      }

      this.lines[l].maximum = lineMaximum;
      this.lines[l].minimum = lineMinimum;

      if (!this.lines[l].maximumAnimation) {
        this.lines[l].maximumAnimation = this.createAnimation(this.lines[l].maximum);
      } else if (oldLineMaximum !== this.lines[l].maximum && this.lines[l].maximum !== -Infinity) {
        this.animate(this.lines[l].maximumAnimation, this.lines[l].maximum);
      }

      if (!this.lines[l].minimumAnimation) {
        this.lines[l].minimumAnimation = this.createAnimation(this.lines[l].minimum);
      } else if (oldLineMinimum !== this.lines[l].minimum && this.lines[l].minimum !== Infinity) {
        this.animate(this.lines[l].minimumAnimation, this.lines[l].minimum);
      }

      if (lineMaximum > this.maximum) {
        this.maximum = lineMaximum;
      }
      if (lineMinimum < this.minimum) {
        this.minimum = lineMinimum;
      }
    }

    if (!this.maximumAnimation) {
      this.maximumAnimation = this.createAnimation(this.maximum);
    } else if (oldMaximum !== this.maximum && this.maximum !== -Infinity) {
      this.animate(this.maximumAnimation, this.maximum);
    }

    if (!this.minimumAnimation) {
      this.minimumAnimation = this.createAnimation(this.minimum);
    } else if (oldMinimum !== this.minimum && this.minimum !== Infinity) {
      this.animate(this.minimumAnimation, this.minimum);
    }

    this.zoomRatio = 1 / (this.offsetRight - this.offsetLeft);
  }

  findGlobalMaximumAndMinimum() {
    const elements = this.lines
      .map(line => line.data);
    this.globalMaximum = findMaximum(elements.map(line => findMaximum(line)));
    // Here we also removed finding minimum. Uncommenting these lines will work
    // this.globalMinimum = findMinimum(elements.map(line => findMinimum(line)));
  }

  findOffsetMaximumAndMinimum() {
    const elements = this.lines
      .filter(line => line.visible)
      .map(line => line.data);
    this.offsetMaximum = findMaximum(elements.map(line => findMaximum(line)));
    // Here we also removed finding minimum. Uncommenting these lines will work
    // this.offsetMinimum = findMinimum(elements.map(line => findMinimum(line)));
  }

  setDimensions() {
    this.dimensions.width = this.container.clientWidth;
    this.dimensions.chartWidth = this.dimensions.width - this.chartPadding * 2;

    this.setViewportAttributes();
  }

  setViewportAttributes() {
    this.viewport.setAttribute('width', this.dimensions.width);
    this.viewport.setAttribute('height', this.dimensions.height);

    if (!this.offsetWrapper) {
      return;
    }

    this.offsetWrapper.setAttribute('viewBox', `0,0,${this.dimensions.width},${this.dimensions.offsetHeight}`);
  }

  renderXTicks() {
    let needAnimation = false;

    const comfortableCount = Math.floor(this.xAxis.length / 6);
    const tickInterval = Math.ceil(Math.log2(comfortableCount / this.zoomRatio));
    const ticksCount = Math.ceil(this.xAxis.length / 2 ** tickInterval * this.zoomRatio);

    if (this.xTicksCount && this.xTicksCount !== ticksCount) {
      needAnimation = true;
      for (let [index, tick] of this.xTicks) {
        if (index % (2 ** tickInterval) !== 0) {
          // fade out tick
          this.animate(tick.opacity, 0);
        }
      }
    }

    this.xTicksCount = ticksCount;

    for (let i = 0; i < ticksCount; i++) {
      const newIndex = i * 2 ** tickInterval;
      const position = this.chartPadding + (newIndex / (this.xAxis.length - 1) - this.offsetLeft) * this.dimensions.chartWidth * this.zoomRatio;
      const value = this.xAxis[newIndex];

      if (!value) {
        continue;
      }

      const tick = this.xTicks.get(newIndex);

      if (position + this.chartPadding * 2 >= 0 && position - this.chartPadding <= this.dimensions.width) {
        if (!tick) {
          const tick = this.createXTick(newIndex, needAnimation ? 0 : 1);

          if (needAnimation) {
            // fade in animation
            this.animate(tick.opacity, 1);
          }

          this.xTicks.set(newIndex, tick);
        } else if (needAnimation) {
          // this.animations.fadeIn(tick);
          this.animate(tick.opacity, 1);
        }
      } else if (tick) {
        // forcely remove tick
        this.xTicks.delete(newIndex);
      }
    }
  }

  createXTick(index, opacity = 1) {
    return {
      first: index === 0,
      last: index === this.xAxis.length - 1,
      value: this.getDateLabel(this.xAxis[index]),
      opacity: this.createAnimation(opacity)
    }
  }

  renderYTicks() {
    const requiredTicks = 6;
    const maximum = this.maximumAnimation.value;
    const minimum = this.minimumAnimation.value;
    const yTickInterval = tickIncrement(minimum, maximum, requiredTicks);
    const yTicksCount = Math.ceil((maximum - minimum) / yTickInterval);

    if (this.yTicksCount && yTickInterval * yTicksCount === this.yTicksCount) {
      return;
    }

    this.yTicksCount = yTickInterval * yTicksCount;

    const shouldAnimate = this.yTicks.size !== 0;

    for (let [index, tick] of this.yTicks) {
      if (this.yTicks.size && (index % yTickInterval !== 0) || this.maximum === -Infinity) {
        this.animate(tick.opacity, 0);
      }
    }

    if (this.maximum === -Infinity) {
      return;
    }

    for (let i = 0; i < yTicksCount; i++) {
      const value = this.minimum + i * yTickInterval;
      const tick = this.yTicks.get(value);

      if (!tick) {
        const tick = this.createYTick(value, shouldAnimate ? 0 : 1);

        if (shouldAnimate) {
          this.animate(tick.opacity, 1);
          // this.animations.fadeIn(tick);
        }

        this.yTicks.set(value, tick);

        // this.yAxisViewport.appendChild(tick);
      } else {
        if (shouldAnimate) {
          this.animate(tick.opacity, 1);
          // this.animations.fadeIn(tick);
        }
      }
    }
  }

  createYTick(value, opacity = 1) {
    return {
      minimum: value === this.minimumAnimation.value,
      value,
      opacity: this.createAnimation(opacity)
    }
  }

  getDateLabel(time) {
    const date = new Date(time);

    return months[date.getMonth()] + ' ' + date.getDate();
  }

  renderCanvasLines() {
    this.context.lineWidth = this.mainLineWidth;

    this.lines.forEach(line => this.renderCanvasLine(line));
  }

  renderCanvasLine(line) {
    this.context.globalAlpha = line.opacity.value;
    this.context.strokeStyle = line.color;
    this.context.beginPath();
    this.context.lineJoin = 'bevel';
    this.context.lineCap = 'butt';

    let maximum = this.maximumAnimation.value;
    let minimum = this.minimumAnimation.value;
    const height = this.dimensions.chartHeight;
    const width = this.dimensions.chartWidth;

    if (this.yScaled) {
      maximum = line.maximumAnimation.value;
      minimum = line.minimumAnimation.value;
    }

    const left = Math.floor(this.offsetLeft * line.data.length) - 3;
    const right = Math.ceil(this.offsetRight * line.data.length) + 3;

    for (let i = left; i < right; i++) {
      const offset = this.chartPadding - this.offsetLeft * width * this.zoomRatio;
      const y = ((maximum - line.data[i]) / (maximum - minimum) * height);
      const x = (width / (line.data.length - 1) * i * this.zoomRatio) + offset;

      if (i === left) {
        this.context.moveTo(x, y);
      } else {
        this.context.lineTo(x, y);
      }
    }

    this.context.stroke();
  }

  renderCanvasXTicks() {
    this.renderXTicks();
    this.context.clearRect(0, this.dimensions.chartHeight, this.dimensions.width, 25);

    for (let [index, tick] of this.xTicks) {
      if (tick.opacity.to === 0 && tick.opacity.value === 0) {
        this.xTicks.delete(index);
        continue;
      }
      const position = this.chartPadding + (index / (this.xAxis.length - 1) - this.offsetLeft) * this.dimensions.chartWidth * this.zoomRatio;
      if (this.updateAnimation(tick.opacity)) this.needRedraw = true;

      this.renderCanvasXTick(index, tick, position);
    }
  }

  renderCanvasXTick(index, tick, position) {
    this.context.globalAlpha = tick.opacity.value;
    this.context.fillStyle = 'rgba(37, 37, 41, 0.5)';
    this.context.fillText(tick.value, position, this.dimensions.chartHeight + 15);
  }

  renderCanvasYTicks() {
    this.renderYTicks();
    this.context.clearRect(0, 0, this.chartPadding * 2 + this.dimensions.chartWidth, this.dimensions.chartHeight);

    this.context.fillStyle = 'rgba(37, 37, 41, 0.5)';
    this.context.strokeStyle = 'rgba(24, 45, 59, 0.1)';
    this.context.lineWidth = this.gridLineWidth;

    for (let [index, tick] of this.yTicks) {
      if (tick.opacity.to === 0 && tick.opacity.value === 0) {
        this.xTicks.delete(index);
        continue;
      }
      const maximum = this.maximumAnimation.value;
      const minimum = this.minimumAnimation.value;
      const coord = (maximum - index) / (maximum - minimum) * this.dimensions.chartHeight;
      if (this.updateAnimation(tick.opacity)) this.needRedraw = true;

      this.renderCanvasYTick(index, tick, coord);
    }
  }

  renderCanvasYTick(index, tick, coord) {
    this.context.globalAlpha = tick.opacity.value;
    this.context.beginPath();
    this.context.fillText(tick.value, this.chartPadding, coord - 5);
    this.context.moveTo(this.chartPadding, coord);
    this.context.lineTo(this.dimensions.chartWidth + this.chartPadding, coord);
    this.context.stroke();
  }

  createOffsetLines() {
    this.lines.forEach(line => {
      if (!line.offsetViewport) {
        line.offsetViewport = createElementNS('path', {
          stroke: line.color,
          'vector-effect': 'non-scaling-stroke'
        });
        this.offsetLinesWrapper.appendChild(line.offsetViewport);
      }

      this.renderOffsetLine(line)
    });
  }

  renderOffsetLines() {
    const yZoom = (this.globalMaximum - this.globalMinimum) / (this.offsetMaximum - this.offsetMinimum);

    if (yZoom === 0) {
      return;
    }

    this.offsetLinesWrapper.setAttribute('transform', `scale(1, ${yZoom})`);
    this.offsetLinesWrapper.style.transform = `scale(1, ${yZoom})`;
  }

  renderOffsetLine(line) {
    if (this.offsetMaximum !== -Infinity && this.offsetMinimum !== Infinity) {
      const coords = this.convertLine(line.data, this.dimensions.width, this.dimensions.offsetHeight, this.globalMaximum, this.globalMinimum);

      line.offsetViewport.setAttribute('d', coords);
    }
  }

  convertLine(data, width, height, maximum, minimum) {
    return data
      .map((item, index) => {
        const x = (width / (data.length - 1) * index).toFixed(3);
        const y = ((maximum - item) / (maximum - minimum) * height).toFixed(3);

        if (index === 0) {
          return `M${x},${y}`;
        }

        return `L${x},${y}`;
      })
      .join('');
  }

  toggleLine(label, line) {
    line.visible = !line.visible;

    if (line.visible) {
      this.animate(line.opacity, 1);

      if (line.offsetViewport) {
        line.offsetViewport.style.opacity = '1';
      }
    } else {
      this.animate(line.opacity, 0);

      if (line.offsetViewport) {
        line.offsetViewport.style.opacity = '0';
      }
    }

    label.classList.toggle('chart__toggle-check_disabled');

    this.findOffsetMaximumAndMinimum();
    this.render();
  }

  renderInfo() {
    if (this.selectedX < 0 || this.selectedX >= this.xAxis.length || this.maximum === -Infinity) {
      if (this.infoViewport) {
        this.infoViewport.style.opacity = '0';
      }

      return;
    }

    this.infoViewport.style.opacity = '1';

    const {weekLabel, values: {wrapper: valuesG, values}, xInfoRect, xInfoG, circles} = this.infoData;

    const selectedElement = this.xAxis[this.selectedX];

    const week = new Date(selectedElement);
    const label = `${weeks[week.getDay()]}, ${months[week.getMonth()]} ${week.getDate()}`;
    const offset = this.chartPadding + (this.selectedX / (this.xAxis.length - 1) - this.offsetLeft) * this.dimensions.chartWidth * this.zoomRatio;

    let valuesLength = 0;
    let maxValuesLength = 0;

    this.infoViewport.setAttribute('transform', `translate(${offset}, 0)`);

    let invisibleItems = 0;

    this.lines
      .forEach((line, index) => {
        if (!values.has(line.id)) {
          const elem = createElementNS('text', {
            fill: line.color
          });
          const label = createElementNS('tspan');
          label.classList.add('chart__info-label');
          label.textContent = line.name;
          const value = createElementNS('tspan');
          value.classList.add('chart__info-value');
          elem.appendChild(value);
          elem.appendChild(label);

          values.set(line.id, elem);

          valuesG.appendChild(elem);
        }

        const elem = values.get(line.id);
        const circle = circles.get(line.id);

        if (circle) {
          if (!line.visible) {
            circle.style.opacity = '0';
          } else {
            circle.style.opacity = '1';
          }

          if (this.maximum === -Infinity) {
            return;
          }

          const cy = (this.maximum - line.data[this.selectedX]) / (this.maximum - this.minimum) * this.dimensions.chartHeight;

          circle.setAttribute('cy', cy + 'px');
        }

        if (!line.visible) {
          elem.remove();
          values.delete(line.id);
          invisibleItems--;

          return;
        }

        const currentIndex = index + invisibleItems;
        const value = elem.querySelector('.chart__info-value');
        const label = elem.querySelector('.chart__info-label');

        if (!value || !label) {
          return line.data[this.selectedX];
        }

        const column = 2 % (currentIndex + 1) - 1;
        const x = -17 + Math.max(valuesLength, 30 * (currentIndex % 2));

        elem.setAttribute('x', x + 'px');
        elem.setAttribute('y', (65 + 18 * column) + 'px');
        label.setAttribute('x', x + 'px');
        label.setAttribute('y', (80 + 18 * column) + 'px');

        if (value.textContent !== String(line.data[this.selectedX])) {
          value.textContent = line.data[this.selectedX];
        }

        if ((currentIndex + 1) % 2 === 0) {
          valuesLength = 0;
        } else {
          const elemLength = elem.getBBox().width + 10;

          if (elemLength > maxValuesLength) {
            maxValuesLength = elemLength;
          }
          valuesLength += Math.max(elemLength, maxValuesLength);
        }

        return line.data[this.selectedX];
      });

    if (weekLabel.textContent !== label) {
      weekLabel.textContent = label;
    }

    const weekBB = weekLabel.getBBox();
    const labelsBB = valuesG.getBBox();

    const infoRectWidth = Math.round(Math.max(weekBB.width, labelsBB.width) + 20);
    const infoRectHeight = Math.round(weekBB.height + labelsBB.height + 25);

    if (offset + infoRectWidth > this.dimensions.chartWidth + this.chartPadding * 3 + 5) {
      xInfoG.setAttribute('transform', `translate(${-offset + this.dimensions.chartWidth - infoRectWidth + this.chartPadding * 3 + 5}, 0)`);
    } else if (offset - this.chartPadding * 3 - 5 < 0) {
      xInfoG.setAttribute('transform', `translate(${-offset + this.chartPadding * 3 + 5}, 0)`);
    } else {
      xInfoG.removeAttribute('transform');
    }

    xInfoRect.setAttribute('width', infoRectWidth + 'px');
    xInfoRect.setAttribute('height', infoRectHeight + 'px');
  }

  render() {
    this.renderOffsets();
    this.renderOffsetLines();

    this.needRedraw = true;
  }

  renderCanvas() {
    if (this.updateAnimation(this.maximumAnimation)) this.needRedraw = true;

    if (this.updateAnimation(this.minimumAnimation)) this.needRedraw = true;

    for (let i = 0; i < this.lines.length; i++) {
      if (this.updateAnimation(this.lines[i].opacity)) this.needRedraw = true;

      if (this.updateAnimation(this.lines[i].maximumAnimation)) this.needRedraw = true;
      if (this.updateAnimation(this.lines[i].minimumAnimation)) this.needRedraw = true;
    }

    if (this.needRedraw) {
      this.needRedraw = false;
      this.findMaximumAndMinimum();
      this.renderCanvasYTicks();
      this.renderCanvasLines();
      this.renderCanvasXTicks();
    }

    requestAnimationFrame(() => this.renderCanvas());
  }
}