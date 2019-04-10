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

const svgNS = 'http://www.w3.org/2000/svg';
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weeks = ['Sun', 'Mon', 'Tue', 'Wen', 'Thu', 'Fri', 'Sat'];

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

    this.offsetDrag = {
      mainDrag: null,
      leftDrag: null,
      rightDrag: null,
      leftSpacer: null,
      rightSpacer: null
    };

    this.createViewport();

    this.setDimensions();
    // this.createDefs();

    this.infoViewport = null; // viewport for info window
    this.xTicksCount = 0; // count of y ticks
    this.yTicksCount = 0; // count of y ticks
    this.selectedX = -1; // selected x coord for info window
    this.offsetLeft = 0; // zoom lower limit
    this.offsetRight = 0.3; // zoom upper limit
    this.zoomRatio = 1; // zoom ratio for main chart
    this.fragmentWidth = 0;

    this.maximum = this.createAnimation(0);
    this.minimum = this.createAnimation(0);
    this.offsetMaximum = this.createAnimation(0);
    this.offsetMinimum = this.createAnimation(0);

    this.needRedraw = true;
    this.needOffsetRedraw = true;

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
      if (!this.lines.length) {
        return;
      }

      this.needOffsetRedraw = true;

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

  convertLineData(data, line) {
    const id = line[0];

    return {
      id,
      opacity: this.createAnimation(1),
      name: data.names[id],
      data: line.slice(1),
      color: data.colors[id],
      maximum: this.createAnimation(0),
      minimum: this.createAnimation(0),
      offsetMaximum: this.createAnimation(0),
      offsetMinimum: this.createAnimation(0),
      visible: true
    };
  }

  getData(url) {
    if (!url) {
      throw new Error('Url is invalid');
    }

    fetch(url)
      .then(response => response.json())
      .then(data => {
        this.yScaled = data.y_scaled;
        this.percentage = data.percentage;
        this.stacked = data.stacked;

        this.xAxis = data.columns.find(column => data.types[column[0]] === 'x').slice(1);
        const lines = data.columns.filter(column => data.types[column[0]] === 'line');
        const bars = data.columns.filter(column => data.types[column[0]] === 'bar');
        const areas = data.columns.filter(column => data.types[column[0]] === 'area');

        if (lines.length) {
          this.lines = lines.map(line => this.convertLineData(data, line));
          this.chartType = 'lines';
        } else if (bars.length) {
          this.lines = bars.map(line => this.convertLineData(data, line));
          this.chartType = 'bars';
        } else if (areas.length) {
          this.lines = areas.map(line => this.convertLineData(data, line));
          this.chartType = 'areas';
        }

        this.findOffsetMaximumAndMinimum();

        this.createOffsetWrapper();
        this.setDimensions();
        this.needOffsetRedraw = true;
        if (this.lines.length > 1) {
          this.createToggleCheckboxes();
        }

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

  setAnimation(animation, to) {
    animation.to = to;
    animation.value = to;
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

    this.offsetLinesWrapper = createElementNS('foreignObject');
    this.offsetLinesWrapper.classList.add('chart__offset-line-wrapper');
    this.offsetWrapper.appendChild(this.offsetLinesWrapper);

    this.offsetCanvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'xhtml:canvas');
    this.offsetLinesWrapper.appendChild(this.offsetCanvas);

    this.offsetContext = this.offsetCanvas.getContext('2d');

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

      if ((x >= this.chartPadding + this.offsetLeft * this.dimensions.offsetWidth - safetyZone) && (x < this.chartPadding + this.offsetRight * this.dimensions.offsetWidth - safetyZone)) {
        e.stopPropagation();
        leftDragging = true;
        leftCoordinate = x - this.offsetLeft * this.dimensions.offsetWidth;
      }
      if ((x > this.chartPadding + this.offsetLeft * this.dimensions.offsetWidth + safetyZone) && (x <= this.chartPadding + this.offsetRight * this.dimensions.offsetWidth + safetyZone)) {
        e.stopPropagation();
        rightDragging = true;
        rightCoordinate = x - this.offsetRight * this.dimensions.offsetWidth;
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

          this.offsetLeft = newLeft / this.dimensions.offsetWidth;
        }

        if (rightDragging) {
          let newRight = x - rightCoordinate;

          this.offsetRight = newRight / this.dimensions.offsetWidth;
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
    if (!this.offsetContainer) {
      return;
    }

    const {mainDrag, leftDrag, rightDrag, leftSpacer, rightSpacer} = this.offsetDrag;

    const leftOffset = this.dimensions.offsetWidth * this.offsetLeft;
    const rightOffset = this.dimensions.offsetWidth * this.offsetRight;
    const width = rightOffset - leftOffset;

    leftDrag.setAttribute('x', leftOffset);
    mainDrag.setAttribute('x', leftOffset);
    mainDrag.setAttribute('width', width);
    rightDrag.setAttribute('x', rightOffset - 3);
    leftSpacer.setAttribute('width', leftOffset);
    rightSpacer.setAttribute('x', rightOffset);
    rightSpacer.setAttribute('width', this.dimensions.offsetWidth - rightOffset);
  }

  findOverallMaximumAndMinimum(maximum = 'maximum', minimum = 'minimum', start, end) {
    const oldMaximum = this[maximum].to;
    const oldMinimum = this[minimum].to;
    const fromZero = this.chartType === 'bars' || this.chartType === 'areas';

    let newMaximum;
    let newMinimum;

    let maximumRow = -Infinity;
    const maximums = new Array(this.lines.filter(line => line.visible).length);
    const minimums = new Array(this.lines.filter(line => line.visible).length);

    for (let l = 0; l < this.lines.length; l++) {
      if (!this.lines[l].visible) continue;

      if (this.stacked) {
        maximums[l] = 0;
      } else {
        maximums[l] = -Infinity;
      }
      if (fromZero) {
        minimums[l] = 0;
      } else {
        minimums[l] = Infinity;
      }
    }

    for (let i = start; i < end; i++) {
      let totalHeight = 0;

      for (let l = 0; l < this.lines.length; l++) {
        if (!this.lines[l].visible) continue;

        if (this.lines[l].data[i] > maximums[l]) {
          maximums[l] = this.lines[l].data[i];
        }

        if (!fromZero) {
          if (this.lines[l].data[i] < minimums[l]) {
            minimums[l] = this.lines[l].data[i];
          }
        }

        totalHeight += this.lines[l].data[i];
      }

      if (totalHeight > maximumRow) {
        maximumRow = totalHeight;
      }
    }

    if (this.stacked) {
      newMaximum = maximumRow;
    } else {
      newMaximum = maximums.reduce((acc, max) => max > acc ? max : acc);
    }

    if (!fromZero) {
      newMinimum = minimums.reduce((acc, min) => min < acc ? min : acc);
    } else {
      newMinimum = 0;
    }

    if (newMaximum === -Infinity || !newMaximum) {
      return;
    }

    for (let l = 0; l < this.lines.length; l++) {
      if (!this.lines[l].visible) continue;

      const oldLineMaximum = this.lines[l][maximum].to;
      const oldLineMinimum = this.lines[l][minimum].to;

      const lineMaximum = maximums[l];
      const lineMinimum = minimums[l];

      if (!oldLineMaximum) {
        this.setAnimation(this.lines[l][maximum], lineMaximum);
      } else if (oldLineMaximum !== lineMaximum && lineMaximum !== -Infinity) {
        this.animate(this.lines[l][maximum], lineMaximum);
      }


      if (!fromZero) {
        if (!oldLineMinimum) {
          this.setAnimation(this.lines[l][minimum], lineMinimum);
        } else if (oldLineMinimum !== lineMinimum && lineMinimum !== Infinity) {
          this.animate(this.lines[l][minimum], lineMinimum);
        }
      }
    }

    if (!oldMaximum) {
      this.setAnimation(this[maximum], newMaximum);
    } else if (oldMaximum !== newMaximum && newMaximum !== -Infinity) {
      this.animate(this[maximum], newMaximum);
    }

    if (!fromZero) {
      if (!oldMinimum) {
        this.setAnimation(this[minimum], newMinimum);
      } else if (oldMinimum !== newMinimum && newMinimum !== Infinity) {
        this.animate(this[minimum], newMinimum);
      }
    }
  }

  findMaximumAndMinimum() {
    const start = Math.floor(this.offsetLeft * this.xAxis.length);
    const end = Math.ceil(this.offsetRight * this.xAxis.length);

    this.findOverallMaximumAndMinimum('maximum', 'minimum', start, end);

    this.zoomRatio = 1 / (this.offsetRight - this.offsetLeft);
  }

  findOffsetMaximumAndMinimum() {
    const start = 0;
    const end = this.xAxis.length;

    this.findOverallMaximumAndMinimum('offsetMaximum', 'offsetMinimum', start, end);
  }

  setDimensions() {
    // this.pixelRatio = window.devicePixelRatio || 1;
    this.pixelRatio = 1;
    this.mainLineWidth = 2 * this.pixelRatio;
    this.gridLineWidth = this.pixelRatio;

    this.dimensions = {
      width: (this.params.width || this.container.clientWidth) * this.pixelRatio,
      height: (this.params.height || this.container.clientHeight) * this.pixelRatio,
      chartHeight: ((this.params.height || this.container.clientHeight) - 25) * this.pixelRatio,
      chartWidth: ((this.params.width || this.container.clientWidth) - this.chartPadding * 2) * this.pixelRatio,
      chartPadding: this.chartPadding * this.pixelRatio,
      offsetWidth: (this.params.width || this.container.clientWidth) - this.chartPadding * 2,
      offsetHeight: 38
    };

    if (this.xAxis && this.xAxis.length) {
      this.fragmentWidth = this.dimensions.chartWidth / this.xAxis.length;
    }

    this.setViewportAttributes();
  }

  setViewportAttributes() {
    this.viewport.setAttribute('width', this.dimensions.width);
    this.viewport.setAttribute('height', this.dimensions.height);
    this.viewport.style.height = this.dimensions.height / this.pixelRatio + 'px';

    if (!this.offsetWrapper) {
      return;
    }

    this.offsetLinesWrapper.setAttribute('width', this.dimensions.offsetWidth);
    this.offsetLinesWrapper.setAttribute('height', this.dimensions.offsetHeight);
    this.offsetCanvas.setAttribute('width', this.dimensions.offsetWidth);
    this.offsetCanvas.setAttribute('height', this.dimensions.offsetHeight);
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
          const tick = this.createXTick(newIndex);

          if (needAnimation) {
            // fade in animation
            this.setAnimation(tick.opacity, 0);
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

  createXTick(index) {
    return {
      first: index === 0,
      last: index === this.xAxis.length - 1,
      value: this.getDateLabel(this.xAxis[index]),
      opacity: this.createAnimation(1)
    }
  }

  renderYTicks() {
    const requiredTicks = 6;
    const maximum = this.maximum.to;
    const minimum = this.minimum.to;
    const yTickInterval = tickIncrement(minimum, maximum, requiredTicks);
    const yTicksCount = Math.ceil((maximum - minimum) / yTickInterval);

    if (this.yTicksCount && yTickInterval * yTicksCount === this.yTicksCount) {
      return;
    }

    this.yTicksCount = yTickInterval * yTicksCount;

    const shouldAnimate = this.yTicks.size !== 0;

    for (let [index, tick] of this.yTicks) {
      if (this.yTicks.size && (index % yTickInterval !== 0) || maximum === -Infinity || maximum === 0) {
        this.animate(tick.opacity, 0);
      }
    }

    for (let i = 0; i < yTicksCount; i++) {
      const value = this.minimum.to + i * yTickInterval;
      const tick = this.yTicks.get(value);

      if (!tick) {
        const tick = this.createYTick(value);

        if (shouldAnimate) {
          this.setAnimation(tick.opacity, 0);
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

  createYTick(value) {
    return {
      minimum: value === this.minimum.to,
      value: this.getYLabel(value),
      // value,
      opacity: this.createAnimation(1)
    }
  }

  getDateLabel(time) {
    const date = new Date(time);

    return months[date.getMonth()] + ' ' + date.getDate();
  }

  getYLabel(value) {
    if (value / 1000000 ^ 0 > 0) {
      return (value / 1000000 ^ 0) + 'M'
    } else if (value / 1000 ^ 0 > 0) {
      return (value / 1000 ^ 0) + 'k'
    } else {
      return value;
    }
  }

  renderCanvasLines() {
    this.context.clearRect(0, 0, this.dimensions.chartPadding * 2 + this.dimensions.chartWidth, this.dimensions.chartHeight);
    this.context.lineWidth = this.mainLineWidth;
    const offset = this.dimensions.chartPadding - this.offsetLeft * this.dimensions.chartWidth * this.zoomRatio;
    let maximum = this.maximum.value;
    let minimum = this.minimum.value;
    let left = Math.floor(this.offsetLeft * this.xAxis.length) - 3;
    let right = Math.ceil(this.offsetRight * this.xAxis.length) + 3;
    let w = this.fragmentWidth * this.zoomRatio;

    if (left < 0) left = 0;
    if (right > this.xAxis.length) right = this.xAxis.length;

    this.lines.forEach((line, index) => {
      if (this.yScaled) {
        maximum = line.maximum.value;
        minimum = line.minimum.value;
      }

      this.renderCanvasLine(
        this.context,
        line,
        index,
        this.dimensions.chartHeight,
        w,
        offset,
        maximum,
        minimum,
        left,
        right
      )
    });
  }

  renderCanvasOffsetLines() {
    this.offsetContext.clearRect(0, 0, this.dimensions.offsetWidth, this.dimensions.offsetHeight);
    this.offsetContext.lineWidth = this.gridLineWidth;
    let maximum = this.offsetMaximum.value;
    let minimum = this.offsetMinimum.value;
    let w = this.fragmentWidth / this.pixelRatio;

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];

      if (this.yScaled) {
        maximum = line.offsetMaximum.value;
        minimum = line.offsetMinimum.value;
      }

      this.renderCanvasLine(
        this.offsetContext,
        line,
        i,
        this.dimensions.offsetHeight,
        w,
        0,
        maximum,
        minimum,
        0,
        this.xAxis.length
      )
    }
  }

  renderCanvasLine(context = this.context, line, index = 0, height, w, offset, maximum, minimum, left, right) {
    const opacity = line.opacity.value;
    context.globalAlpha = 1;

    if (!line.opacity.value) return;

    context.beginPath();

    if (this.chartType === 'lines') {
      context.globalAlpha = line.opacity.value;
      context.strokeStyle = line.color;
      context.lineJoin = 'bevel';
      context.lineCap = 'butt';

      for (let i = left; i < right; i++) {
        const y = ((maximum - line.data[i]) / (maximum - minimum) * height);
        const x = w * i + offset;

        if (i === left) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }

      context.stroke();
    } else if (this.chartType === 'bars') {
      context.fillStyle = line.color;
      // context.globalAlpha = 0.5;

      for (let i = left; i < right; i++) {
        const x = w * i + offset;

        let value = line.data[i];
        let bottom = minimum;

        if (this.stacked) {
          for (let j = 0; j < index; j++) {
            bottom += this.lines[j].data[i] * this.lines[j].opacity.value;
          }

          value += bottom;
        }

        const y = ((maximum - value) / (maximum - minimum) * height);
        const h = ((maximum - bottom) / (maximum - minimum) * height) - y;

        context.rect(x, y + h * (1 - opacity), w, h * opacity);
      }

      context.fill();
    }
  }

  renderCanvasXTicks() {
    this.renderXTicks();
    this.context.clearRect(0, this.dimensions.chartHeight, this.dimensions.width, 25 * this.pixelRatio);
    this.context.font = `${10 * this.pixelRatio}px Helvetica, sans-serif`;

    for (let [index, tick] of this.xTicks) {
      if (tick.opacity.to === 0 && tick.opacity.value === 0) {
        this.xTicks.delete(index);
        continue;
      }
      const position = this.dimensions.chartPadding + (index / (this.xAxis.length - 1) - this.offsetLeft) * this.dimensions.chartWidth * this.zoomRatio;
      if (this.updateAnimation(tick.opacity)) this.needRedraw = true;

      this.renderCanvasXTick(index, tick, position);
    }
  }

  renderCanvasXTick(index, tick, position) {
    this.context.globalAlpha = tick.opacity.value;
    this.context.fillStyle = 'rgba(37, 37, 41, 0.5)';
    this.context.fillText(tick.value, position, this.dimensions.chartHeight + 15 * this.pixelRatio);
  }

  renderCanvasYTicks() {
    this.renderYTicks();

    this.context.fillStyle = 'rgba(37, 37, 41, 0.5)';
    this.context.strokeStyle = 'rgba(24, 45, 59, 0.1)';
    this.context.font = `${10 * this.pixelRatio}px Helvetica, sans-serif`;
    this.context.lineWidth = this.gridLineWidth;

    for (let [index, tick] of this.yTicks) {
      if (tick.opacity.to === 0 && tick.opacity.value === 0) {
        this.xTicks.delete(index);
        continue;
      }
      const maximum = this.maximum.value;
      const minimum = this.minimum.value;
      const coord = (maximum - index) / (maximum - minimum) * this.dimensions.chartHeight;
      if (this.updateAnimation(tick.opacity)) this.needRedraw = true;

      this.renderCanvasYTick(index, tick, coord);
    }
  }

  renderCanvasYTick(index, tick, coord) {
    this.context.globalAlpha = tick.opacity.value;
    this.context.beginPath();
    this.context.fillText(tick.value, this.dimensions.chartPadding, coord - 5 * this.pixelRatio);
    this.context.moveTo(this.dimensions.chartPadding, coord);
    this.context.lineTo(this.dimensions.chartWidth + this.dimensions.chartPadding, coord);
    this.context.stroke();
  }

  toggleLine(label, line) {
    line.visible = !line.visible;

    this.animate(line.opacity, line.visible ? 1 : 0);

    label.classList.toggle('chart__toggle-check_disabled');

    this.findOffsetMaximumAndMinimum();

    this.needOffsetRedraw = true;
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
    this.findMaximumAndMinimum();
    this.renderOffsets();

    this.needRedraw = true;
  }

  renderCanvas() {
    if (this.updateAnimation(this.maximum)) this.needRedraw = true;
    if (this.updateAnimation(this.minimum)) this.needRedraw = true;

    if (this.updateAnimation(this.offsetMaximum)) this.needOffsetRedraw = true;
    if (this.updateAnimation(this.offsetMinimum)) this.needOffsetRedraw = true;

    for (let i = 0; i < this.lines.length; i++) {
      if (this.updateAnimation(this.lines[i].opacity)) {
        this.needRedraw = true;
        this.needOffsetRedraw = true;
      }

      if (this.updateAnimation(this.lines[i].maximum)) this.needRedraw = true;
      if (this.updateAnimation(this.lines[i].minimum)) this.needRedraw = true;
    }

    if (this.needRedraw) {
      this.needRedraw = false;
      this.renderCanvasLines();
      this.renderCanvasYTicks();
      this.renderCanvasXTicks();
    }

    if (this.needOffsetRedraw) {
      this.needOffsetRedraw = false;
      this.renderCanvasOffsetLines();
    }

    requestAnimationFrame(() => this.renderCanvas());
  }
}