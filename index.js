document.addEventListener('DOMContentLoaded', () => {
  const charts = document.createElement('div');
  charts.classList.add('charts');
  document.body.appendChild(charts);

  fetch('chart_data.json')
    .then(data => data.json())
    .then(data => {
      data.slice(0, 1).map((chartData) => {
        return new TelegramChart(charts, chartData, {height: 300});
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

const createAnimation = (node, parent, duration = 300) => {
  if (node.dataset.transition) {
    return;
  }
  const start = Date.now();
  const easeInQuad = t => t * t;
  parent.appendChild(node);
  const animationFrameFn = () => {
    const now = Date.now();
    const p = (now - start) / duration;
    const result = easeInQuad(p);
    node.style.opacity = Math.min(result, 1);
    node.dataset.transition = 'true';


    if (result < 1) {
      requestAnimationFrame(animationFrameFn);
    } else {
      delete node.dataset.transition;
    }
  };

  requestAnimationFrame(animationFrameFn);
};

const removeAnimation = (node, parent, duration = 300) => {
  if (node.dataset.transition) {
    return;
  }

  const start = Date.now();
  const easeInQuad = t => t * t;
  const animationFrameFn = () => {
    const now = Date.now();
    const p = (now - start) / duration;
    const result = easeInQuad(p);
    node.style.opacity = 1 - result;
    node.dataset.transition = 'true';

    if (result >= 1) {
      if (parent.contains(node)) {
        parent.removeChild(node);
      }
    } else {
      requestAnimationFrame(animationFrameFn)
    }
  };

  requestAnimationFrame(animationFrameFn);
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
    this.container = document.createElement('div');
    this.container.classList.add('chart');
    this.container.style.width = '100%';
    selector.appendChild(this.container);

    this.params = params;

    this.dimensions = {
      width: this.params.width || this.container.clientWidth,
      height: this.params.height || this.container.clientHeight,
      chartHeight: (this.params.height || this.container.clientHeight) - 25
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
    this.viewport = document.createElementNS(svgNS, 'svg');
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
    this.defs = document.createElementNS(svgNS, 'defs');

    const infoFilter = document.createElementNS(svgNS, 'filter');
    infoFilter.setAttribute('id', 'info-filter');

    const feDropShadow = document.createElementNS(svgNS, 'feDropShadow');
    feDropShadow.setAttribute('in', 'SourceGraphic');
    feDropShadow.setAttribute('flood-color', '#98989D');
    feDropShadow.setAttribute('flood-opacity', '0.5');
    feDropShadow.setAttribute('stdDeviation', '1');
    feDropShadow.setAttribute('dx', '0');
    feDropShadow.setAttribute('dy', '1');
    feDropShadow.setAttribute('result', 'dropShadow');

    infoFilter.appendChild(feDropShadow);
    this.defs.appendChild(infoFilter);
    this.viewport.appendChild(this.defs);
  }

  createLinesViewport() {
    this.linesViewport = document.createElementNS(svgNS, 'g');
    this.linesViewport.setAttribute('fill', 'none');
    this.linesViewport.setAttribute('stroke-width', '3');
    this.linesViewport.setAttribute('stroke-linecap', 'round');
    this.linesViewport.setAttribute('stroke-linejoin', 'round');
    this.viewport.appendChild(this.linesViewport);
  }

  createOffsetWrapper() {
    this.offsetWrapper = document.createElementNS(svgNS, 'svg');
    this.offsetWrapper.classList.add('chart__offset-wrapper');
    this.container.appendChild(this.offsetWrapper);

    const mainDrag = document.createElementNS(svgNS, 'rect');
    mainDrag.classList.add('chart__offset-main-drag');
    mainDrag.setAttribute('fill', 'transparent');
    this.offsetWrapper.appendChild(mainDrag);

    const leftDrag = document.createElementNS(svgNS, 'rect');
    leftDrag.classList.add('chart__offset-drag');
    leftDrag.classList.add('chart__offset-drag_left');
    leftDrag.setAttribute('fill', 'rgba(0, 0, 0, 0.6)');
    this.offsetWrapper.appendChild(leftDrag);

    const rightDrag = document.createElementNS(svgNS, 'rect');
    rightDrag.classList.add('chart__offset-drag');
    rightDrag.classList.add('chart__offset-drag_right');
    this.offsetWrapper.appendChild(rightDrag);

    this.offsetLinesWrapper = document.createElementNS(svgNS, 'g');
    this.offsetLinesWrapper.setAttribute('fill', 'none');
    this.offsetLinesWrapper.setAttribute('stroke-width', '1');
    this.offsetLinesWrapper.setAttribute('stroke-linecap', 'round');
    this.offsetLinesWrapper.setAttribute('stroke-linejoin', 'round');
    this.offsetLinesWrapper.classList.add('chart__offset-line-wrapper');
    this.offsetWrapper.appendChild(this.offsetLinesWrapper);

    const leftSpacer = document.createElementNS(svgNS, 'rect');
    leftSpacer.classList.add('chart__offset-spacer');
    leftSpacer.classList.add('chart__offset-spacer_left');
    leftSpacer.setAttribute('x', '0');
    this.offsetWrapper.appendChild(leftSpacer);

    const rightSpacer = document.createElementNS(svgNS, 'rect');
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
    this.lines.forEach(line => {
      const checkbox = document.createElement('input');
      checkbox.setAttribute('type', 'checkbox');
      checkbox.setAttribute('checked', line.visible);
      checkbox.classList.add('chart__toggle-check');
      checkbox.addEventListener('change', () => this.toggleLine(line));
      this.container.appendChild(checkbox);
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

    leftDrag.setAttribute('x', leftOffset + 4);
    mainDrag.setAttribute('x', leftOffset + 2);
    mainDrag.setAttribute('width', width - 4);
    rightDrag.setAttribute('x', rightOffset - 7);
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
    this.minimum = findMinimum(elements
      .map(line => findMinimum(line)));
  }

  findOffsetMaximumAndMinimum() {
    const elements = this.lines
      .filter(line => line.visible)
      .map(line => line.data);
    this.offsetMaximum = findMaximum(elements.map(line => findMaximum(line)));
    this.offsetMinimum = findMinimum(elements.map(line => findMinimum(line)));
  }

  setDimensions() {
    this.dimensions.width = this.container.clientWidth;

    this.setViewportAttributes();
  }

  setViewportAttributes() {
    this.viewport.setAttribute('viewBox', `0,0,${this.dimensions.width},${this.dimensions.height}`);
    this.viewport.setAttribute('width', this.dimensions.width);
    this.viewport.setAttribute('height', this.dimensions.height);

    if (!this.offsetWrapper) {
      return;
    }

    this.offsetWrapper.setAttribute('viewBox', `0,0,${this.dimensions.width},${50}`);
    this.offsetWrapper.setAttribute('width', this.dimensions.width);
    this.offsetWrapper.setAttribute('height', '50');
  }

  renderXAxis() {
    if (!this.xAxisViewport) {
      this.xAxisViewport = document.createElementNS(svgNS, 'g');
      this.xAxisViewport.classList.add('chart__x-axis');

      const tickContainer = document.createElementNS(svgNS, 'g');
      tickContainer.classList.add('chart__x-ticks');
      tickContainer.setAttribute('vector-effect', "non-scaling-stroke");
      tickContainer.setAttribute('transform', 'translate(0, 15)');
      this.xAxisViewport.appendChild(tickContainer);

      this.viewport.appendChild(this.xAxisViewport);
      this.xAxisViewport.style.transform = `translate(0, ${this.dimensions.chartHeight}px)`;
    }

    this.createXTicks();
  }

  createXTicks() {
    const zoomRatio = 1 / (this.offsetRight - this.offsetLeft);
    const tickContainer = this.xAxisViewport.querySelector('.chart__x-ticks');
    let ticks = tickContainer.querySelectorAll('text');
    let needAnimation = false;

    const comfortableCount = Math.floor(this.xAxis.length / 5);
    const tickInterval = Math.ceil(Math.log2(comfortableCount / zoomRatio));
    const ticksCount = Math.ceil(this.xAxis.length / 2 ** tickInterval * zoomRatio);

    if (this.xTicksCount && this.xTicksCount !== ticksCount) {
      needAnimation = true;
      for (let i = 0; i < ticks.length; i++) {
        if (Number(ticks[i].dataset.index) % (2 ** tickInterval) === 0) {
          continue;
        }
        removeAnimation(ticks[i], tickContainer);
      }
    }

    this.xTicksCount = ticksCount;

    for (let i = 0; i < ticksCount; i++) {
      const newIndex = i * 2 ** tickInterval;
      const position = (newIndex / (this.xAxis.length - 1) - this.offsetLeft) * this.dimensions.width * zoomRatio;
      const value = this.xAxis[newIndex];

      if (!value) {
        continue;
      }

      if (position >= 0 && position <= this.dimensions.width) {
        const foundTick = findNode(ticks, tick => Number(tick.dataset.index) === newIndex);

        if (foundTick < 0) {
          const tick = this.createXTick(newIndex);

          if (needAnimation) {
            createAnimation(tick, tickContainer);
          } else {
            tickContainer.appendChild(tick);
          }

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
      const position = (index / (this.xAxis.length - 1) - this.offsetLeft) * this.dimensions.width * zoomRatio;

      ticks[i].setAttribute('transform', `translate(${position}, 0)`);
    }
  }

  createXTick(index) {
    const tick = document.createElementNS(svgNS, 'text');
    tick.innerHTML = this.getDateLabel(this.xAxis[index]);
    tick.dataset.index = index;

    return tick;
  }

  renderYAxis() {
    if (!this.yAxisViewport) {
      this.yAxisViewport = document.createElementNS(svgNS, 'g');
      this.yAxisViewport.classList.add('chart__y-axis');

      this.viewport.appendChild(this.yAxisViewport);
    }

    this.createYTicks();
  }

  createYTicks() {
    const comfortableTicks = 6;
    const yTicksCount = Math.floor((this.maximum - this.minimum) / comfortableTicks);

    if (this.yTicksCount && yTicksCount === this.yTicksCount) {
      return;
    }

    this.yTicksCount = yTicksCount;

    const ticks = this.yAxisViewport.querySelectorAll('g');
    const shouldAnimate = ticks.length !== 0;

    for (let i = 0; i < ticks.length; i++) {
      if (ticks && this.minimum % Number(ticks[i].dataset.id) !== 0) {
        // removeAnimation(ticks[i], this.yAxisViewport);
        this.yAxisViewport.removeChild(ticks[i]);
      }
    }

    for (let i = 0; i < comfortableTicks; i++) {
      const value = this.minimum + i * yTicksCount;
      const tickIndex = findNode(ticks, tick => Number(tick.dataset.id) === value);
      const coord = (this.maximum - value) / (this.maximum - this.minimum) * this.dimensions.chartHeight;
      let tick = ticks[tickIndex];

      if (!tick) {
        tick = this.createYTick(value);

        // if (shouldAnimate) {
        //   createAnimation(tick, this.yAxisViewport);
        // } else {
        //   this.yAxisViewport.appendChild(tick);
        // }

        this.yAxisViewport.appendChild(tick);
      }

      const tickLine = tick.querySelector('line');
      const tickLabel = tick.querySelector('text');

      tickLine.setAttribute('y1', coord + 'px');
      tickLine.setAttribute('y2', coord + 'px');
      tickLabel.setAttribute('y', coord - 5 + 'px');
    }
  }

  createYTick(value) {
    const tick = document.createElementNS(svgNS, 'g');
    const tickLine = document.createElementNS(svgNS, 'line');
    const tickLabel = document.createElementNS(svgNS, 'text');

    if (value === this.minimum) {
      tick.classList.add('.chart__y-line');
    }

    tick.dataset.id = value;
    tickLine.setAttribute('x1', '0');
    tickLine.setAttribute('x2', this.dimensions.width);
    tickLabel.setAttribute('x', '0');

    tickLabel.innerHTML = value;

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
      line.viewport = document.createElementNS(svgNS, 'path');
      line.viewport.setAttribute('stroke', line.color);
      line.viewport.setAttribute('vector-effect', "non-scaling-stroke");
      this.linesViewport.appendChild(line.viewport);
    }

    const zoomRatio = 1 / (this.offsetRight - this.offsetLeft);

    if (this.maximum !== -Infinity && this.minimum !== Infinity) {
      const coords = this.convertLine(line.data, this.dimensions.chartHeight, maximum, minimum);

      line.viewport.setAttribute('d', coords);
    }

    line.viewport.style.transform = `translate(${-this.offsetLeft * this.dimensions.width * zoomRatio}px, 0) scale(${zoomRatio}, 1)`;
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
      line.offsetViewport = document.createElementNS(svgNS, 'path');
      line.offsetViewport.setAttribute('stroke', line.color);
      this.offsetLinesWrapper.appendChild(line.offsetViewport);
    }

    if (this.offsetMaximum !== -Infinity && this.offsetMinimum !== Infinity) {
      const coords = this.convertLine(line.data, 50, this.offsetMaximum, this.offsetMinimum);

      line.offsetViewport.setAttribute('d', coords);
    }
  }

  convertLine(data, height, maximum, minimum) {
    return data
      .map((item, index) => {
        const x = (this.dimensions.width / (data.length - 1) * index);
        const yZoom = height / (maximum - minimum);
        const y = ((maximum - item) * yZoom);

        if (index === 0) {
          return `M${x},${y}`;
        }

        return `L${x},${y}`;
      })
      .join();
  }

  toggleLine(line) {
    line.visible = !line.visible;

    this.findOffsetMaximumAndMinimum();
    this.render();
  }

  createInfo() {
    if (this.infoViewport) {
      return;
    }

    this.infoViewport = document.createElementNS(svgNS, 'g');
    this.infoViewport.classList.add('chart__info-viewport');

    const xLine = document.createElementNS(svgNS, 'line');
    xLine.classList.add('chart__info-line');
    xLine.setAttribute('y1', '3px');
    xLine.setAttribute('y2', this.dimensions.chartHeight + 'px');
    xLine.setAttribute('stroke-width', '1px');
    this.infoViewport.appendChild(xLine);

    const xInfoG = document.createElementNS(svgNS, 'g');
    xInfoG.classList.add('chart__info-wrapper');

    this.lines.forEach(line => {
      const lineCircle = document.createElementNS(svgNS, 'circle');
      lineCircle.classList.add('chart__info-circle');
      lineCircle.setAttribute('r', '5px');
      lineCircle.setAttribute('fill', 'white');
      lineCircle.setAttribute('stroke', line.color);
      lineCircle.setAttribute('stroke-width', '3px');
      lineCircle.dataset.id = line.id;

      this.infoViewport.appendChild(lineCircle);
    });

    this.infoViewport.appendChild(xInfoG);

    const xInfoRect = document.createElementNS(svgNS, 'rect');
    xInfoRect.classList.add('chart__info-rect');
    xInfoRect.setAttribute('stroke-width', '1px');
    xInfoRect.setAttribute('fill', 'white');
    xInfoRect.setAttribute('rx', '5');
    xInfoRect.setAttribute('ry', '5');
    xInfoG.appendChild(xInfoRect);

    const weekLabel = document.createElementNS(svgNS, 'text');
    weekLabel.classList.add('chart__info-week');
    weekLabel.setAttribute('fill', 'black');
    weekLabel.setAttribute('y', '25px');
    xInfoG.appendChild(weekLabel);

    const valuesG = document.createElementNS(svgNS, 'g');
    valuesG.classList.add('chart__info-values');
    xInfoG.appendChild(valuesG);

    this.viewport.appendChild(this.infoViewport);
  }

  renderInfo() {
    if (this.selectedX < 0) {
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
    const xLine = this.infoViewport.querySelector('.chart__info-line');
    const valuesG = this.infoViewport.querySelector('.chart__info-values');
    const xInfoRect = this.infoViewport.querySelector('.chart__info-rect');

    const selectedElement = this.xAxis[this.selectedX];

    const week = new Date(selectedElement);
    const label = `${weeks[week.getDay()]}, ${months[week.getMonth()]} ${week.getDate()}`;
    const zoomRatio = 1 / (this.offsetRight - this.offsetLeft);
    const lineOffset = (this.selectedX / (this.xAxis.length - 1) - this.offsetLeft) * this.dimensions.width * zoomRatio;
    const offset = Math.min(lineOffset, this.dimensions.width - 150);
    const rectX = offset - 30;
    const elems = valuesG.querySelectorAll('text');

    let valuesLength = 0;
    let maxValuesLength = 0;

    this.lines
      .forEach((line, index) => {
        const foundElem = findNode(elems, elem => elem.dataset.id === line.id);
        let elem = elems[foundElem];

        if (!elem) {
          elem = document.createElementNS(svgNS, 'text');
          elem.dataset.id = line.id;
          elem.setAttribute('fill', line.color);
          const label = document.createElementNS(svgNS, 'tspan');
          label.classList.add('chart__info-label');
          label.innerHTML = line.name;
          const value = document.createElementNS(svgNS, 'tspan');
          value.classList.add('chart__info-value');
          elem.appendChild(value);
          elem.appendChild(label);

          valuesG.appendChild(elem);
        }

        if (!line.visible) {
          elem.remove();

          return;
        }

        const value = elem.querySelector('.chart__info-value');
        const label = elem.querySelector('.chart__info-label');
        const circles = this.infoViewport.querySelectorAll('.chart__info-circle');
        const lineCircle = findNode(circles, circle => circle.dataset.id === line.id);

        if (!value || !label) {
          return line.data[this.selectedX];
        }

        const column = 2 % (index + 1) - 1;
        const x = rectX + 10 + Math.max(valuesLength, 40 * (index % 2));

        elem.setAttribute('x', x + 'px');
        elem.setAttribute('y', (65 + 18 * column) + 'px');
        label.setAttribute('x', x + 'px');
        label.setAttribute('y', (80 + 18 * column) + 'px');

        if (lineCircle >= 0) {
          const circle = circles[lineCircle];
          circle.setAttribute('cx', lineOffset + 'px');
          circle.setAttribute('cy', ((this.maximum - line.data[this.selectedX]) / (this.maximum - this.minimum) * this.dimensions.chartHeight) + 'px');
        }

        if ((index + 1) % 2 === 0) {
          valuesLength = 0;
        } else {
          const elemLength = elem.getBBox().width + 10;

          if (elemLength > maxValuesLength) {
            maxValuesLength = elemLength;
          }
          valuesLength += Math.max(elemLength, maxValuesLength);
        }

        if (value.innerHTML !== String(line.data[this.selectedX])) {
          value.innerHTML = line.data[this.selectedX];
        }

        return line.data[this.selectedX];
      });

    if (weekLabel.innerHTML !== label) {
      weekLabel.innerHTML = label;
    }

    weekLabel.setAttribute('x', (rectX + 10) + 'px');
    xLine.setAttribute('x1', lineOffset + 'px');
    xLine.setAttribute('x2', lineOffset + 'px');

    const weekBB = weekLabel.getBBox();
    const labelsBB = valuesG.getBBox();

    const infoRectWidth = Math.round(Math.max(weekBB.width, labelsBB.width) + 20);
    const infoRectHeight = Math.round(weekBB.height + labelsBB.height + 22);

    xInfoRect.setAttribute('x', rectX + 'px');
    xInfoRect.setAttribute('y', '1px');
    xInfoRect.setAttribute('width', infoRectWidth + 'px');
    xInfoRect.setAttribute('height', infoRectHeight + 'px');
  }

  render() {
    this.renderXAxis();
    this.renderLines();
    this.renderYAxis();
    this.renderOffsets();
    this.renderOffsetLines();
    this.renderInfo();
  }
}