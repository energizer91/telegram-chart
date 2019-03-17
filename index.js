document.addEventListener('DOMContentLoaded', () => {
  const charts = document.createElement('div');
  charts.classList.add('charts');
  document.body.appendChild(charts);

  fetch('chart_data.json')
    .then(data => data.json())
    .then(data => {
      data.slice(0, 1).map((chartData, index) => {
        return new TelegramChart(charts, chartData, {height: 300, title: 'Chart ' + (index + 1)});
      })
    })
});

const findNode = (ticks, fn) => {
  for (let i = 0; i < ticks.length; i++) {
    if (fn(ticks[i])) {
      return i;
    }
  }

  return -1;
};

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

const createAnimation = (node, duration = 300) => {
  if (node.dataset.transition) {
    return;
  }

  node.dataset.transition = 'true';
  node.style.opacity = 0;

  const start = Date.now();
  const easeInQuad = t => t * t;
  const animationFrameFn = () => {
    const now = Date.now();
    const p = (now - start) / duration;
    const result = easeInQuad(p);
    node.style.opacity = Math.min(result, 1);

    if (result < 1) {
      requestAnimationFrame(animationFrameFn);
    } else {
      delete node.dataset.transition;
    }
  };

  requestAnimationFrame(animationFrameFn);

  // node.animate({opacity: [1, 0]}, {duration});

  // node.classList.add('showing');
  //
  // setTimeout(() => node && node.classList.remove('showing'), duration);
};

const removeAnimation = (node, duration = 300) => {
  if (node.dataset.transition) {
    return;
  }

  node.dataset.transition = 'true';

  const start = Date.now();
  const easeInQuad = t => t * t;
  const animationFrameFn = () => {
    const now = Date.now();
    const p = (now - start) / duration;
    const result = easeInQuad(p);
    node.style.opacity = 1 - result;

    if (result >= 1) {
      node.remove();
    } else {
      requestAnimationFrame(animationFrameFn)
    }
  };

  requestAnimationFrame(animationFrameFn);

  // const anim = node.animate({opacity: [0, 1]}, {duration});
  //
  // anim.onfinish = () => node && node.remove();

  // node.classList.add('hidden');
  //
  // setTimeout(() => node && node.remove(), duration);
};

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

const animate = (node, style, from, to, duration = 300) => {
  if (node.dataset.transition) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const start = Date.now();
    const easeInQuad = t => t * t;
    const animationFrameFn = () => {
      const now = Date.now();
      const p = (now - start) / duration;
      const result = easeInQuad(p);
      node.style[style] = from > to ? from - to * result : from + to * result;
      node.dataset.transition = 'true';

      if (result >= 1) {
        return resolve(node);
      } else {
        requestAnimationFrame(animationFrameFn)
      }
    };

    requestAnimationFrame(animationFrameFn);
  });
};

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
  constructor(selector, data = {}, params = {}) {
    this.container = createElement('div');
    this.container.classList.add('chart');
    this.container.style.width = '100%';
    selector.appendChild(this.container);

    this.title = createElement('p');
    this.title.classList.add('chart__title');
    this.title.innerText = params.title;
    this.container.appendChild(this.title);

    this.params = params;
    this.chartPadding = 10;

    this.dimensions = {
      width: this.params.width || this.container.clientWidth,
      height: this.params.height || this.container.clientHeight,
      chartHeight: (this.params.height || this.container.clientHeight) - 25,
      chartWidth: (this.params.width || this.container.clientWidth) - this.chartPadding * 2
    };

    this.createViewport();
    this.createDefs();
    this.createOffsetWrapper();
    this.setDimensions();

    this.xAxis = data.columns.find(column => data.types[column[0]] === 'x').slice(1);
    this.xAxisViewport = null;
    this.yAxisViewport = null;
    this.xTicksCount = 0;
    this.yTicksCount = 0;
    this.selectedX = -1;
    this.infoViewport = null;
    this.lines = data.columns.filter(column => data.types[column[0]] === 'line').map(line => {
      const id = line[0];

      return {
        id,
        name: data.names[id],
        data: line.slice(1),
        color: data.colors[id],
        viewport: null,
        offsetViewport: null,
        visible: true
      };
    });

    this.createLinesViewport();
    this.createToggleCheckboxes();

    this.offsetLeft = 0.5;
    this.offsetRight = 0.8;
    this.maximum = 0;
    this.minimum = 0;
    this.zoomRatio = 1;
    this.offsetMaximum = 0;
    this.offsetMinimum = 0;

    window.addEventListener('resize', () => {
      this.setDimensions();
      this.render();
    });

    this.findOffsetMaximumAndMinimum();

    setTimeout(() => this.render(), 0);
    console.log(this);
  }

  createViewport() {
    this.viewport = createElementNS('svg');
    this.viewport.classList.add('chart__viewport');
    this.container.appendChild(this.viewport);

    this.viewport.addEventListener('mousemove', e => {
      e.stopPropagation();

      const selectedX = Math.floor((this.offsetLeft + e.clientX / this.dimensions.width * (this.offsetRight - this.offsetLeft)) * this.xAxis.length);

      if (selectedX === this.selectedX) {
        return;
      }

      this.selectedX = selectedX;

      this.renderInfo();
    });

    document.addEventListener('mousemove', () => {
      this.selectedX = -1;

      if (this.infoViewport) {
        this.infoViewport.style.opacity = 0;
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

  createLinesViewport() {
    this.linesViewport = createElementNS('g', {
      fill: 'none',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      // 'clip-path': 'url(#lines-clip)'
    });
    this.linesViewport.classList.add('chart__lines-viewport');
    this.viewport.appendChild(this.linesViewport);
  }

  createOffsetWrapper() {
    this.offsetContainer = createElement('div');
    this.offsetContainer.classList.add('chart__offset-container');
    this.offsetContainer.style.padding = `0 ${this.chartPadding}px`;
    this.container.appendChild(this.offsetContainer);

    this.offsetWrapper = createElementNS('svg');
    this.offsetWrapper.classList.add('chart__offset-wrapper');
    this.offsetContainer.appendChild(this.offsetWrapper);

    const mainDrag = createElementNS('rect', {
      fill: 'transparent'
    });
    mainDrag.classList.add('chart__offset-main-drag');
    this.offsetWrapper.appendChild(mainDrag);

    const leftDrag = createElementNS('rect');
    leftDrag.classList.add('chart__offset-drag');
    leftDrag.classList.add('chart__offset-drag_left');
    this.offsetWrapper.appendChild(leftDrag);

    const rightDrag = createElementNS('rect');
    rightDrag.classList.add('chart__offset-drag');
    rightDrag.classList.add('chart__offset-drag_right');
    this.offsetWrapper.appendChild(rightDrag);

    this.offsetLinesWrapper = createElementNS('g', {
      fill: 'none',
      'stroke-width': '1',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    });
    this.offsetLinesWrapper.classList.add('chart__offset-line-wrapper');
    this.offsetWrapper.appendChild(this.offsetLinesWrapper);

    const leftSpacer = createElementNS('rect', {
      x: '0'
    });
    leftSpacer.classList.add('chart__offset-spacer');
    leftSpacer.classList.add('chart__offset-spacer_left');
    this.offsetWrapper.appendChild(leftSpacer);

    const rightSpacer = createElementNS('rect');
    rightSpacer.classList.add('chart__offset-spacer');
    rightSpacer.classList.add('chart__offset-spacer_right');
    this.offsetWrapper.appendChild(rightSpacer);

    let leftDragging = false;
    let rightDragging = false;
    let leftCoordinate = 0;
    let rightCoordinate = 0;
    let safetyZone = 20;

    const mouseDownHandler = e => {
      const x = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;

      if ((x >= this.offsetLeft * this.dimensions.width - safetyZone) && (x < this.offsetRight * this.dimensions.width - safetyZone)) {
        e.stopPropagation();
        leftDragging = true;
        leftCoordinate = x - this.offsetLeft * this.dimensions.width;
      }
      if ((x > this.offsetLeft * this.dimensions.width + safetyZone) && (x <= this.offsetRight * this.dimensions.width + safetyZone)) {
        e.stopPropagation();
        rightDragging = true;
        rightCoordinate = x - this.offsetRight * this.dimensions.width;
      }
    };
    const mouseUpHandler = () => {
      leftDragging = false;
      rightDragging = false;
      leftCoordinate = 0;
      rightCoordinate = 0;
    };
    const mouseMoveHandler = e => {
      const x = e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientX : e.clientX;

      if (leftDragging || rightDragging) {
        if (leftDragging) {
          let newLeft = x - leftCoordinate;

          if (newLeft < 0) {
            newLeft = 0;
          }

          this.offsetLeft = newLeft / this.dimensions.width;
        }

        if (rightDragging) {
          let newRight = x - rightCoordinate;

          if (newRight > this.dimensions.width) {
            newRight = this.dimensions.width;
          }

          this.offsetRight = newRight / this.dimensions.width;
        }

        this.render();
      }
    };

    if ('ontouchstart' in window) {
      this.offsetWrapper.addEventListener('touchstart', e => mouseDownHandler(e));
      this.offsetWrapper.addEventListener('touchmove', e => mouseMoveHandler(e));
      document.addEventListener('touchend', () => mouseUpHandler());
    } else {
      this.offsetWrapper.addEventListener('mousedown', e => mouseDownHandler(e));
      this.offsetWrapper.addEventListener('mousemove', e => mouseMoveHandler(e));
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

  renderOffsets() {
    const mainDrag = this.offsetWrapper.querySelector('.chart__offset-main-drag');
    const leftDrag = this.offsetWrapper.querySelector('.chart__offset-drag_left');
    const rightDrag = this.offsetWrapper.querySelector('.chart__offset-drag_right');
    const leftSpacer = this.offsetWrapper.querySelector('.chart__offset-spacer_left');
    const rightSpacer = this.offsetWrapper.querySelector('.chart__offset-spacer_right');

    if (!mainDrag && !leftDrag && !rightDrag && !leftSpacer && !rightSpacer) {
      return;
    }

    const leftOffset = this.dimensions.width * this.offsetLeft;
    const rightOffset = this.dimensions.width * this.offsetRight;
    const width = rightOffset - leftOffset;

    leftDrag.setAttribute('x', leftOffset);
    mainDrag.setAttribute('x', leftOffset);
    mainDrag.setAttribute('width', width);
    rightDrag.setAttribute('x', rightOffset - 3);
    leftSpacer.setAttribute('width', leftOffset);
    rightSpacer.setAttribute('x', rightOffset);
    rightSpacer.setAttribute('width', this.dimensions.width - width);
  }

  findMaximumAndMinimum() {
    const elements = this.lines
      .filter(line => line.visible)
      .map(line => line.data.slice(Math.floor(this.offsetLeft * this.xAxis.length), Math.ceil(this.offsetRight * this.xAxis.length)));
    this.maximum = findMaximum(elements
      .map(line => findMaximum(line)));
    // this.minimum = findMinimum(elements
    //   .map(line => findMinimum(line)));

    this.zoomRatio = 1 / (this.offsetRight - this.offsetLeft);
  }

  findOffsetMaximumAndMinimum() {
    const elements = this.lines
      .filter(line => line.visible)
      .map(line => line.data);
    this.offsetMaximum = findMaximum(elements.map(line => findMaximum(line)));
    // this.offsetMinimum = findMinimum(elements.map(line => findMinimum(line)));
  }

  setDimensions() {
    this.dimensions.width = this.container.clientWidth;
    this.dimensions.chartWidth = this.dimensions.width - this.chartPadding * 2;

    this.setViewportAttributes();
    this.setYAxisLengths()
  }

  setViewportAttributes() {
    this.viewport.setAttribute('viewBox', `0,0,${this.dimensions.width},${this.dimensions.height}`);
    this.viewport.setAttribute('width', this.dimensions.width);
    this.viewport.setAttribute('height', this.dimensions.height);

    if (!this.offsetWrapper) {
      return;
    }

    this.offsetWrapper.setAttribute('viewBox', `0,0,${this.dimensions.width},${38}`);
    this.offsetWrapper.setAttribute('width', this.dimensions.width);
    this.offsetWrapper.setAttribute('height', '38');
  }

  setYAxisLengths() {
    if (!this.yAxisViewport) {
      return;
    }

    const lines = this.yAxisViewport.querySelectorAll('line');

    lines.forEach(line => {
      line.setAttribute('x2', this.dimensions.chartWidth + this.chartPadding);
    })
  }

  renderXAxis() {
    if (!this.xAxisViewport) {
      this.xAxisViewport = createElementNS('g');
      this.xAxisViewport.classList.add('chart__x-axis');

      const tickContainer = createElementNS('g', {
        'vector-effect': 'non-scaling-stroke',
        transform: 'translate(0, 15)'
      });
      tickContainer.classList.add('chart__x-ticks');
      this.xAxisViewport.appendChild(tickContainer);

      this.viewport.appendChild(this.xAxisViewport);
      this.xAxisViewport.style.transform = `translate(0, ${this.dimensions.chartHeight}px)`;
    }

    this.createXTicks();
  }

  createXTicks() {
    const tickContainer = this.xAxisViewport.querySelector('.chart__x-ticks');
    let ticks = tickContainer.querySelectorAll('text');
    let needAnimation = false;

    const comfortableCount = Math.floor(this.xAxis.length / 5);
    const tickInterval = Math.ceil(Math.log2(comfortableCount / this.zoomRatio));
    const ticksCount = Math.ceil(this.xAxis.length / 2 ** tickInterval * this.zoomRatio);

    if (this.xTicksCount && this.xTicksCount !== ticksCount) {
      needAnimation = true;
      for (let i = 0; i < ticks.length; i++) {
        if (Number(ticks[i].dataset.index) % (2 ** tickInterval) !== 0) {
          removeAnimation(ticks[i]);
        }
      }
    }

    this.xTicksCount = ticksCount;

    for (let i = 0; i < ticksCount; i++) {
      const newIndex = i * 2 ** tickInterval;
      const position = (newIndex / (this.xAxis.length - 1) - this.offsetLeft) * this.dimensions.width * this.zoomRatio;
      const value = this.xAxis[newIndex];

      if (!value) {
        continue;
      }

      if (position >= 0 && position <= this.dimensions.width) {
        const foundTick = findNode(ticks, tick => Number(tick.dataset.index) === newIndex);

        if (foundTick < 0) {
          const tick = this.createXTick(newIndex);

          if (needAnimation) {
            createAnimation(tick);
          }

          tickContainer.appendChild(tick);
        }
      } else {
        const foundTick = findNode(ticks, tick => Number(tick.dataset.value) === value);

        if (foundTick >= 0) {
          tickContainer.removeChild(ticks[foundTick]);
        }
      }
    }

    ticks = tickContainer.querySelectorAll('text');

    for (let i = 0; i < ticks.length; i++) {
      const index = (ticks[i].dataset.index);
      const position = (index / (this.xAxis.length - 1) - this.offsetLeft) * this.dimensions.width * this.zoomRatio;

      ticks[i].setAttribute('transform', `translate(${position}, 0)`);
    }
  }

  createXTick(index) {
    const tick = createElementNS('text');
    tick.textContent = this.getDateLabel(this.xAxis[index]);
    tick.dataset.index = index;

    return tick;
  }

  renderYAxis() {
    if (!this.yAxisViewport) {
      this.yAxisViewport = createElementNS('g');
      this.yAxisViewport.classList.add('chart__y-axis');

      this.viewport.appendChild(this.yAxisViewport);
    }

    this.createYTicks();

    const ticks = this.yAxisViewport.querySelectorAll('g');

    for (let i = 0; i < ticks.length; i++) {
      const index = Number(ticks[i].dataset.id);
      const coord = (this.maximum - index) / (this.maximum - this.minimum) * this.dimensions.chartHeight;

      ticks[i].setAttribute('transform', `translate(0, ${coord})`);
    }
  }

  createYTicks() {
    const requiredTicks = 6;
    //const yTicksCount = Math.ceil((this.maximum - this.minimum) / comfortableTicks);
    const yTickInterval = tickIncrement(this.minimum, this.maximum, requiredTicks);
    const yTicksCount = Math.ceil((this.maximum - this.minimum) / yTickInterval);

    if (this.yTicksCount && yTickInterval * yTicksCount === this.yTicksCount) {
      return;
    }

    this.yTicksCount = yTickInterval * yTicksCount;

    let ticks = this.yAxisViewport.querySelectorAll('g');
    const shouldAnimate = ticks.length !== 0;

    for (let i = 0; i < ticks.length; i++) {
      if (ticks && (Number(ticks[i].dataset.id) % yTickInterval !== 0) || this.maximum === -Infinity) {
        removeAnimation(ticks[i]);
        // this.yAxisViewport.removeChild(ticks[i]);
      }
    }

    if (this.maximum === -Infinity) {
      return;
    }

    for (let i = 0; i < yTicksCount; i++) {
      const value = this.minimum + i * yTickInterval;
      const tickIndex = findNode(ticks, tick => Number(tick.dataset.id) === value);
      let tick = ticks[tickIndex];

      if (!tick) {
        tick = this.createYTick(value);

        if (shouldAnimate) {
          createAnimation(tick);
        }

        this.yAxisViewport.appendChild(tick);
      }
    }
  }

  createYTick(value) {
    const tick = createElementNS('g');
    const tickLine = createElementNS('line', {
      x1: this.chartPadding,
      y1: '0',
      x2: this.chartPadding + this.dimensions.chartWidth,
      y2: '0'
    });
    const tickLabel = createElementNS('text', {
      x: this.chartPadding,
      y: '-5px'
    });

    if (value === this.minimum) {
      tick.classList.add('.chart__y-line');
    }

    tick.dataset.id = value;
    tickLabel.textContent = value;

    tick.appendChild(tickLine);
    tick.appendChild(tickLabel);

    return tick;
  }

  getDateLabel(time) {
    const date = new Date(time);

    return months[date.getMonth()] + ' ' + date.getDate();
  }

  renderLines() {
    this.findMaximumAndMinimum();
    this.lines.forEach(line => this.renderLine(line));

    this.linesViewport.setAttribute('transform', `translate(${this.chartPadding + -this.offsetLeft * this.dimensions.chartWidth * this.zoomRatio}, 0) scale(${this.zoomRatio}, 1)`);
  }

  renderLine(line, maximum = this.maximum, minimum = this.minimum) {
    if (!line.visible) {
      if (line.viewport) {
        line.viewport.style.opacity = 0;
      }
    } else {
      if (line.viewport) {
        line.viewport.style.opacity = 1;
      }
    }

    if (!line.viewport) {
      line.viewport = createElementNS('path', {
        stroke: line.color,
        'vector-effect': 'non-scaling-stroke'
      });
      this.linesViewport.appendChild(line.viewport);
    }

    if (this.maximum !== -Infinity && this.minimum !== Infinity) {
      const coords = this.convertLine(line.data, this.dimensions.chartWidth, this.dimensions.chartHeight, maximum, minimum);

      line.viewport.setAttribute('d', coords);
    }

    line.viewport.setAttribute('transform', ``);
  }

  renderOffsetLines() {
    this.lines.forEach(line => this.renderOffsetLine(line));
  }

  renderOffsetLine(line) {
    if (!line.visible) {
      if (line.offsetViewport) {
        line.offsetViewport.style.opacity = 0;
        return;
      }
    } else {
      if (line.offsetViewport) {
        line.offsetViewport.style.opacity = 1;
      }
    }

    if (!line.offsetViewport) {
      line.offsetViewport = createElementNS('path', {
        stroke: line.color
      });
      this.offsetLinesWrapper.appendChild(line.offsetViewport);
    }

    if (this.offsetMaximum !== -Infinity && this.offsetMinimum !== Infinity) {
      const coords = this.convertLine(line.data, this.dimensions.width, 38, this.offsetMaximum, this.offsetMinimum);

      line.offsetViewport.setAttribute('d', coords);
    }
  }

  convertLine(data, width, height, maximum, minimum) {
    return data
      .map((item, index) => {
        const x = (width / (data.length - 1) * index).toFixed(3);
        const yZoom = height / (maximum - minimum);
        const y = ((maximum - item) * yZoom).toFixed(3);

        if (index === 0) {
          return `M${x},${y}`;
        }

        return `L${x},${y}`;
      })
      .join();
  }

  toggleLine(label, line) {
    line.visible = !line.visible;

    label.classList.toggle('chart__toggle-check_disabled');

    this.findOffsetMaximumAndMinimum();
    this.render();
  }

  createInfo() {
    if (this.infoViewport) {
      return;
    }

    this.infoViewport = createElementNS('g');
    this.infoViewport.classList.add('chart__info-viewport');

    const xLine = createElementNS('line', {
      y1: '3px',
      y2: this.dimensions.chartHeight + 'px',
      x1: '0',
      x2: '0',
      'stroke-width': '1px'
    });
    xLine.classList.add('chart__info-line');
    this.infoViewport.appendChild(xLine);

    const xInfoG = createElementNS('g');
    xInfoG.classList.add('chart__info-wrapper');

    this.lines.forEach(line => {
      const lineCircle = createElementNS('circle', {
        r: '4px',
        cx: '0',
        stroke: line.color,
        'stroke-width': '2px'
      });
      lineCircle.classList.add('chart__info-circle');
      lineCircle.dataset.id = line.id;

      this.infoViewport.appendChild(lineCircle);
    });

    this.infoViewport.appendChild(xInfoG);

    const xInfoRect = createElementNS('rect', {
      'stroke-width': '1px',
      rx: '5',
      ry: '5',
      y: '1px',
      x: '-25px'
    });
    xInfoRect.classList.add('chart__info-rect');
    xInfoG.appendChild(xInfoRect);

    const weekLabel = createElementNS('text', {
      fill: 'black',
      y: '19px',
      x: '-17px'
    });
    weekLabel.classList.add('chart__info-week');
    xInfoG.appendChild(weekLabel);

    const valuesG = createElementNS('g');
    valuesG.classList.add('chart__info-values');
    xInfoG.appendChild(valuesG);

    this.viewport.appendChild(this.infoViewport);
  }

  renderInfo() {
    if (this.selectedX < 0 || this.selectedX >= this.xAxis.length) {
      if (this.infoViewport) {
        this.infoViewport.style.opacity = 0;
      }

      return;
    }

    if (!this.infoViewport) {
      this.createInfo();
    }

    this.infoViewport.style.opacity = 1;

    const weekLabel = this.infoViewport.querySelector('.chart__info-week');
    const valuesG = this.infoViewport.querySelector('.chart__info-values');
    const xInfoRect = this.infoViewport.querySelector('.chart__info-rect');
    const xInfoWrapper = this.infoViewport.querySelector('.chart__info-wrapper');

    const selectedElement = this.xAxis[this.selectedX];

    const week = new Date(selectedElement);
    const label = `${weeks[week.getDay()]}, ${months[week.getMonth()]} ${week.getDate()}`;
    const offset = this.chartPadding + (this.selectedX / (this.xAxis.length - 1) - this.offsetLeft) * this.dimensions.chartWidth * this.zoomRatio;
    const elems = valuesG.querySelectorAll('text');

    let valuesLength = 0;
    let maxValuesLength = 0;

    this.infoViewport.setAttribute('transform', `translate(${offset}, 0)`);

    this.lines
      .forEach((line, index) => {
        const foundElem = findNode(elems, elem => elem.dataset.id === line.id);
        let elem = elems[foundElem];

        if (!elem) {
          elem = createElementNS('text', {
            fill: line.color
          });
          elem.dataset.id = line.id;
          const label = createElementNS('tspan');
          label.classList.add('chart__info-label');
          label.textContent = line.name;
          const value = createElementNS('tspan');
          value.classList.add('chart__info-value');
          elem.appendChild(value);
          elem.appendChild(label);

          valuesG.appendChild(elem);
        }

        const circles = this.infoViewport.querySelectorAll('.chart__info-circle');
        const lineCircle = findNode(circles, circle => circle.dataset.id === line.id);

        if (lineCircle >= 0) {
          const circle = circles[lineCircle];

          if (!line.visible) {
            circle.style.opacity = 0;
          } else {
            circle.style.opacity = 1;
          }

          if (this.maximum === -Infinity) {
            return;
          }

          circle.setAttribute('cy', ((this.maximum - line.data[this.selectedX]) / (this.maximum - this.minimum) * this.dimensions.chartHeight) + 'px');
        }

        if (!line.visible) {
          elem.remove();

          return;
        }

        const value = elem.querySelector('.chart__info-value');
        const label = elem.querySelector('.chart__info-label');

        if (!value || !label) {
          return line.data[this.selectedX];
        }

        const column = 2 % (index + 1) - 1;
        const x = -17 + Math.max(valuesLength, 30 * (index % 2));

        elem.setAttribute('x', x + 'px');
        elem.setAttribute('y', (65 + 18 * column) + 'px');
        label.setAttribute('x', x + 'px');
        label.setAttribute('y', (80 + 18 * column) + 'px');

        if ((index + 1) % 2 === 0) {
          valuesLength = 0;
        } else {
          const elemLength = elem.getBBox().width + 10;

          if (elemLength > maxValuesLength) {
            maxValuesLength = elemLength;
          }
          valuesLength += Math.max(elemLength, maxValuesLength);
        }

        if (value.textContent !== String(line.data[this.selectedX])) {
          value.textContent = line.data[this.selectedX];
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
      xInfoWrapper.setAttribute('transform', `translate(${-offset + this.dimensions.chartWidth - infoRectWidth + this.chartPadding * 3 + 5}, 0)`);
    } else if (offset - this.chartPadding * 3 - 5 < 0) {
      xInfoWrapper.setAttribute('transform', `translate(${-offset + this.chartPadding * 3 + 5}, 0)`);
    } else {
      xInfoWrapper.removeAttribute('transform');
    }

    xInfoRect.setAttribute('width', infoRectWidth + 'px');
    xInfoRect.setAttribute('height', infoRectHeight + 'px');
  }

  render() {
    this.renderLines();
    this.renderXAxis();
    this.renderYAxis();
    this.renderOffsets();
    this.renderOffsetLines();
    this.renderInfo();
  }
}