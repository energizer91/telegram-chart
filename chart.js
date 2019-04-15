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

const getAngle = (x1, y1, x2, y2, x3, y3) => {
  const A = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const B = Math.sqrt((x3 - x1) ** 2 + (y3 - y1) ** 2);
  const C = Math.sqrt((x3 - x2) ** 2 + (y3 - y2) ** 2);

  const angle = Math.acos((B ** 2 + C ** 2 - A ** 2) / (2 * B * C))

  if (y2 < y3) {
    return 2 * Math.PI - angle;
  }

  return angle;
};

const getTrailingZeroes = value => {
  if (value / 10 < 1) {
    return '0' + value;
  }

  return value;
};

const svgNS = 'http://www.w3.org/2000/svg';
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const weeks = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

class TelegramChart {
  constructor(selector, url = '', params = {name: 'Default chart'}) {
    this.container = createElement('div');
    this.container.classList.add('chart');
    this.container.style.width = '100%';
    selector.appendChild(this.container);

    this.titleContainer = createElement('div');
    this.titleContainer.classList.add('chart__title-container');
    this.container.appendChild(this.titleContainer);

    this.title = createElement('span');
    this.title.classList.add('chart__title');
    this.title.innerText = params.title;
    this.titleContainer.appendChild(this.title);

    this.zoomOutLabel = createElement('span');
    this.zoomOutLabel.classList.add('chart__zoom-out-label');
    this.zoomOutLabel.innerText = 'Zoom Out';
    this.titleContainer.appendChild(this.zoomOutLabel);

    this.dateLabel = createElement('span');
    this.dateLabel.classList.add('chart__date-label');
    this.titleContainer.appendChild(this.dateLabel);

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
    this.createDefs();

    this.infoViewport = null; // viewport for info window
    this.xTicksCount = 0; // count of y ticks
    this.xTicksInterval = 0; // count of y ticks
    this.yTicksCount = 0; // count of y ticks
    this.yTicksInterval = 0; // count of y ticks
    this.selectedX = -1; // selected x coord for info window
    this.selectedAnimation = this.createAnimation(0);
    this.selectDirection = 0; // 1 - next day, -1 - previous day, 0 - no change
    this.offsetLeft = 0; // zoom lower limit
    this.offsetRight = 1; // zoom upper limit
    this.offsetStepLimit = 0.3; // what will be minimum offset step so it can change
    this.zoomRatio = 1; // zoom ratio for main chart
    this.fragmentWidth = 0;
    this.lineFragmentWidth = 0;
    this.zoomedIn = false;

    this.offsetLeftAnimation = this.createAnimation(0);
    this.offsetRightAnimation = this.createAnimation(0);

    this.maximum = this.createAnimation(0);
    this.minimum = this.createAnimation(0);
    this.offsetMaximum = this.createAnimation(0);
    this.offsetMinimum = this.createAnimation(0);

    this.needRedraw = true;
    this.needOffsetRedraw = true;
    this.needRedrawDrags = true;

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

    this.zoomOutLabel.addEventListener('click', () => {
      this.zoomOut();
    });

    this.getData(this.url + '/overview.json')
      .then(data => {
        this.overview = data;

        this.offsetLeft = 0;
        this.offsetRight = 0.3;
        this.setAnimation(this.offsetLeftAnimation, this.offsetLeft);
        this.setAnimation(this.offsetRightAnimation, this.offsetRight);

        this.initializeChartData(data);

        this.render();

        requestAnimationFrame(() => this.renderCanvas());
      });

    console.log(this);
  }

  convertLineData(data = {names: [], colors: []}, line) {
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

  initializeChartData(data) {
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

    this.createXAxis();
    this.createYAxis();

    this.createInfo();

    this.needOffsetRedraw = true;
    if (this.lines.length > 1) {
      this.createToggleCheckboxes();
    } else if (this.checkboxContainer) {
      this.checkboxContainer.remove();
    }
  }


  zoomOut() {
    if (!this.overview) {
      throw new Error('no overview information provided');
    }

    this.container.classList.remove('chart_zoomed-in');

    this.zoomedIn = false;
    this.offsetLeft = 0;
    this.offsetRight = 0.3;
    this.setAnimation(this.offsetLeftAnimation, this.offsetLeft);
    this.setAnimation(this.offsetRightAnimation, this.offsetRight);

    this.initializeChartData(this.overview);

    this.render();

    requestAnimationFrame(() => this.renderCanvas());
  }

  getData(url) {
    if (!url) {
      throw new Error('Url is invalid');
    }

    return fetch(url)
      .then(response => response.json());
  }

  createAnimation(value, duration = DURATION, easing = ease) {
    return {
      from: value,
      to: value,
      value,
      start: 0,
      duration,
      result: 0,
      easing
    };
  }

  setAnimation(animation, to) {
    animation.to = to;
    animation.value = to;
    animation.result = 1;
  }

  animate(animation, to) {
    animation.to = to;
    animation.from = animation.value;
    animation.result = 0;
    animation.start = Date.now();
  }

  hasAnimation(animation) {
    return animation.to !== animation.value;
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

    animation.result = result;
    animation.value = from - (from - to) * result;

    return true;
  }

  createViewport() {
    this.absoluteViewport = createElement('div');
    this.absoluteViewport.classList.add('chart__absolute-viewport');
    this.container.appendChild(this.absoluteViewport);
    this.viewport = createElementNS('svg', {
      'preserveAspectRatio': 'xMidYMid meet',
      xmlns: 'http://www.w3.org/2000/svg',
      'xmlns:xlink': 'http://www.w3.org/1999/xlink'
    });
    this.viewport.classList.add('chart__viewport');

    this.canvas = createElement('canvas');
    this.canvas.classList.add('chart__canvas');

    this.absoluteViewport.appendChild(this.canvas);
    this.absoluteViewport.appendChild(this.viewport);

    this.context = this.canvas.getContext('2d');

    const getSelectedRadian = (x, y) => {
      const centerX = this.dimensions.chartWidth / 2;
      const centerY = this.dimensions.chartHeight / 2;
      const radius = this.dimensions.chartHeight / 2;

      const left = Math.floor(this.offsetLeftAnimation.to * this.xAxis.length);
      const right = Math.ceil(this.offsetRightAnimation.to * this.xAxis.length);

      let total = 0;
      const values = new Array(this.lines.length);

      for (let i = 0; i < this.lines.length; i++) {
        if (!this.lines[i].opacity.value) continue;
        for (let j = left; j < right; j++) {
          if (!values[i]) {
            values[i] = 0;
          }
          values[i] += this.lines[i].data[j] * this.lines[i].opacity.value;
        }
        total += values[i];
      }

      let start = 0;

      for (let i = 0; i < this.lines.length; i++) {
        if (!this.lines[i].opacity.value) continue;

        const phi = start + values[i] / total * 2 * Math.PI;
        const selectedAngle = getAngle(centerX + radius, centerY, x, y, centerX, centerY);

        if (selectedAngle >= start && selectedAngle <= phi) {
          if (this.selectedX !== i) {
            this.setAnimation(this.selectedAnimation, 0);
          }
          this.animate(this.selectedAnimation, 1);
          this.selectedX = i;

          break;
        }

        start = phi;
      }

      this.renderInfo();
    };

    const getSelectedX = x => {
      const selectedX = Math.floor((this.offsetLeft + x / (this.dimensions.chartPadding + this.dimensions.chartWidth) * (this.offsetRight - this.offsetLeft)) * (this.xAxis.length - 1));

      if (selectedX === this.selectedX) {
        return;
      }

      if (this.selectedX < selectedX) {
        this.selectDirection = 1;
      } else if (this.selectedX > selectedX) {
        this.selectDirection = -1;
      } else {
        this.selectDirection = 0;
      }

      this.selectedX = selectedX;
      this.animate(this.selectedAnimation, 1);

      this.renderInfo();

      this.needRedraw = true;
    };

    const touchStartEvent = e => {
      if (e.path.includes(this.infoViewport)) {
        return;
      }
      e.stopPropagation();
      if (this.chartType === 'circle') {
        const x = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
        const y = e.touches && e.touches.length ? e.touches[0].clientY : e.clientY;
        const targetTop = e.target.getBoundingClientRect().top;

        getSelectedRadian(x, y - targetTop);
        return;
      }

      const x = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;

      getSelectedX(x);
    };

    const touchMoveEvent = e => {
      e.stopPropagation();
      if (this.chartType === 'circle') {
        const x = e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientY : e.clientY;
        const y = e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientY : e.clientY;

        getSelectedRadian(x, y);
        return;
      }
      const x = e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientX : e.clientX;

      getSelectedX(x);
    };

    const removeSelectedX = e => {
      if (e.path.includes(this.infoViewport)) {
        return;
      }
      if (this.selectedX >= 0) {
        this.needRedraw = true;
      }
      this.selectedX = -1;
      this.animate(this.selectedAnimation, 0);

      if (this.infoViewport) {
        this.infoViewport.style.display = 'none';
      }
    };

    if ('ontouchstart' in window) {
      this.viewport.addEventListener('touchstart', e => touchStartEvent(e));
      this.viewport.addEventListener('touchmove', e => touchMoveEvent(e));
      document.addEventListener('touchstart', e => removeSelectedX(e));
    } else {
      this.viewport.addEventListener('mousemove', e => touchStartEvent(e));
      document.addEventListener('mousemove', e => removeSelectedX(e));
    }
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
    if (this.offsetContainer) {
      return;
    }

    this.offsetContainer = createElement('div');
    this.offsetContainer.classList.add('chart__offset-container');
    this.offsetContainer.style.padding = `0 ${this.chartPadding}px`;
    this.container.appendChild(this.offsetContainer);

    this.offsetAbsoluteViewport = createElement('div');
    this.offsetAbsoluteViewport.classList.add('chart__offset-absolute-viewport');

    this.offsetWrapper = createElementNS('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      'xmlns:xlink': 'http://www.w3.org/1999/xlink'
    });
    this.offsetWrapper.classList.add('chart__offset-wrapper');

    this.offsetCanvas = createElement('canvas');

    this.offsetAbsoluteViewport.appendChild(this.offsetCanvas);
    this.offsetAbsoluteViewport.appendChild(this.offsetWrapper);

    this.offsetContainer.appendChild(this.offsetAbsoluteViewport);

    this.offsetContext = this.offsetCanvas.getContext('2d');

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

        if (this.hasAnimation(this.offsetLeftAnimation) || this.hasAnimation(this.offsetRightAnimation) && this.zoomedIn) {
          return;
        }

        const x = e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientX : e.clientX;

        if (leftDragging) {
          let newLeft = x - leftCoordinate;

          if (this.zoomedIn) {
            const step = Math.round(newLeft / this.dimensions.offsetWidth / this.offsetStepLimit);

            this.offsetLeft = step * this.offsetStepLimit;
          } else {
            this.offsetLeft = newLeft / this.dimensions.offsetWidth;
          }
        }

        if (rightDragging) {
          let newRight = x - rightCoordinate;

          if (this.zoomedIn) {
            const step = Math.round(newRight / this.dimensions.offsetWidth / this.offsetStepLimit);

            this.offsetRight = step * this.offsetStepLimit;
          } else {
            this.offsetRight = newRight / this.dimensions.offsetWidth;
          }
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

        if (this.zoomedIn) {
          this.animate(this.offsetLeftAnimation, this.offsetLeft);
          this.animate(this.offsetRightAnimation, this.offsetRight);
          this.needRedraw = true;
        } else {
          this.setAnimation(this.offsetLeftAnimation, this.offsetLeft);
          this.setAnimation(this.offsetRightAnimation, this.offsetRight);

          this.render();
        }
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
    if (this.checkboxContainer) {
      this.checkboxContainer.remove();
    }

    this.checkboxContainer = createElement('div');
    this.checkboxContainer.classList.add('chart__checks');
    this.offsetContainer.appendChild(this.checkboxContainer);

    const checkboxes = [];

    this.lines.forEach((line, index) => {
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

      checkboxes.push(label);

      if (!line.visible) {
        label.classList.add('chart__toggle-check_disabled');
      }

      let timeout;
      let longTap = false;

      const toggleLine = (e, label, line) => {
        if (this.lines.filter(line => line.visible).length === 1 && line.visible || longTap) {
          e.preventDefault();

          return;
        }

        if (line.visible) {
          this.setLine(label, line, false);
        } else {
          this.setLine(label, line, true);
        }
      };

      const longTapStart = e => {
        longTap = false;
        timeout = setTimeout(() => {
          e.stopImmediatePropagation();
          e.preventDefault();
          longTap = true;

          if (!line.visible) {
            this.setLine(label, line, true);
            checkboxes[index].checked = true;
          }

          this.lines.forEach((disabledLine, disabledIndex) => {
            if (disabledIndex === index) {
              return;
            }

            this.setLine(checkboxes[disabledIndex], disabledLine, false);
            checkboxes[disabledIndex].checked = false;
          })
        }, 500);
      };

      const longTapEnd = () => {
        clearTimeout(timeout);
      };

      if ('ontouchstart' in window) {
        label.addEventListener('touchstart', e => longTapStart(e));
        label.addEventListener('touchend', (e) => longTapEnd(e));
      } else {
        label.addEventListener('mousedown', e => longTapStart(e));
        label.addEventListener('mouseup', (e) => longTapEnd(e));
      }

      label.addEventListener('change', e => toggleLine(e, label, line));

      label.appendChild(checkbox);
      label.appendChild(icon);
      label.appendChild(text);
      this.checkboxContainer.appendChild(label);
    });
  }

  createXAxis() {
    if (this.xAxisViewport) {
      return;
    }

    this.xAxisViewport = createElementNS('g', {
      transform: `translate(0, ${this.dimensions.chartHeight + 15})`
    });
    this.xAxisViewport.classList.add('chart__x-axis');
    this.viewport.appendChild(this.xAxisViewport);
  }

  createYAxis() {
    if (this.yAxisViewport) {
      return;
    }

    this.yAxisViewport = createElementNS('g');
    this.yAxisViewport.classList.add('chart__y-axis');
    this.viewport.appendChild(this.yAxisViewport);
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
      x: '-13px'
    });
    this.infoData.weekLabel.classList.add('chart__info-week');
    this.infoData.xInfoG.appendChild(this.infoData.weekLabel);

    this.infoData.values.wrapper = createElementNS('g');
    this.infoData.values.wrapper.classList.add('chart__info-values');
    this.infoData.xInfoG.appendChild(this.infoData.values.wrapper);

    this.viewport.appendChild(this.infoViewport);

    this.infoViewport.addEventListener('click', e => {
      e.stopPropagation();

      if (this.selectedX < 0) {
        return;
      }

      if (this.zoomedIn) {
        return;
      }

      const dataset = new Date(this.xAxis[this.selectedX]);
      const dataString = `${dataset.getUTCFullYear()}-${getTrailingZeroes(dataset.getUTCMonth() + 1)}`;

      console.log('click', dataString);

      if (this.chartType === 'areas') {
        this.zoomedIn = true;
        this.container.classList.add('chart_zoomed-in');

        this.xTicksInterval = 0;
        this.xTicksCount = 0;
        this.yTicksInterval = 0;
        this.yTicksCount = 0;

        let rightDays = this.selectedX + 3;
        let leftDays = this.selectedX - 3;

        if (rightDays > this.xAxis.length) {
          const error = this.xAxis.length - rightDays;
          rightDays -= error;
          leftDays -= error
        }

        if (leftDays < 0) {
          rightDays += leftDays;
          leftDays = 0;
        }

        const newData = {...this.overview, columns: this.overview.columns.map(column => [column[0], ...column.slice(leftDays + 1, rightDays + 2)])};

        this.initializeChartData(newData);
        this.chartType = 'circle';

        this.setAnimation(this.offsetLeftAnimation, this.offsetLeft);
        this.setAnimation(this.offsetRightAnimation, this.offsetRight);

        this.offsetStepLimit = 1 / 7;
        // this.offsetLeft = this.offsetStepLimit * (this.selectedX - leftDays);
        // this.offsetRight = this.offsetStepLimit * (rightDays - this.selectedX);
        this.offsetLeft = this.offsetStepLimit * 3;
        this.offsetRight = this.offsetStepLimit * 4;

        this.animate(this.offsetLeftAnimation, this.offsetLeft);
        this.animate(this.offsetRightAnimation, this.offsetRight);

        this.selectedX = -1;

        this.render();

        return;
      }

      this.getData(`${this.url}/${dataString}/${getTrailingZeroes(dataset.getUTCDate())}.json`)
        .then(data => {
          console.log(data);
          this.zoomedIn = true;
          this.container.classList.add('chart_zoomed-in');
          this.initializeChartData(data);

          this.offsetStepLimit = 24 / this.xAxis.length;

          this.setAnimation(this.offsetLeftAnimation, this.offsetLeft);
          this.setAnimation(this.offsetRightAnimation, this.offsetRight);

          if (this.params.zoomOverview) {
            this.offsetLeft = 0;
            this.offsetRight = 1;
          } else {
            this.offsetLeft = this.offsetStepLimit * 3;
            this.offsetRight = this.offsetStepLimit * 4;
          }

          this.animate(this.offsetLeftAnimation, this.offsetLeft);
          this.animate(this.offsetRightAnimation, this.offsetRight);

          this.selectedX = -1;

          this.render();
        })
    }, {capture: true})
  }

  createCircleInfo() {
    if (this.circleInfoViewport) {
      return;
    }

    this.circleInfoViewport = createElementNS('g');
    this.circleInfoViewport.classList.add('chart__circle-info-viewport');


  }

  renderOffsets() {
    if (!this.offsetContainer) {
      return;
    }

    const {mainDrag, leftDrag, rightDrag, leftSpacer, rightSpacer} = this.offsetDrag;

    let offsetLeft = this.offsetLeft;
    let offsetRight = this.offsetRight;

    if (this.zoomedIn) {
      offsetLeft = this.offsetLeftAnimation.value;
      offsetRight = this.offsetRightAnimation.value;

      if (this.updateAnimation(this.offsetLeftAnimation)) this.needRedraw = true;
      if (this.updateAnimation(this.offsetRightAnimation)) this.needRedraw = true;
    }

    const leftOffset = this.dimensions.offsetWidth * offsetLeft;
    const rightOffset = this.dimensions.offsetWidth * offsetRight;
    const width = rightOffset - leftOffset;

    leftDrag.setAttribute('x', leftOffset);
    mainDrag.setAttribute('x', leftOffset);
    mainDrag.setAttribute('width', width);
    rightDrag.setAttribute('x', rightOffset - 3);
    leftSpacer.setAttribute('width', leftOffset);
    rightSpacer.setAttribute('x', rightOffset);
    rightSpacer.setAttribute('width', this.dimensions.offsetWidth - rightOffset);

    this.renderDateLabel();
  }

  findOverallMaximumAndMinimum(maximum = 'maximum', minimum = 'minimum', start, end) {
    if (this.percentage) {
      this.setAnimation(this[maximum], 100);
      this.setAnimation(this[minimum], 0);

      return;
    }

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
      newMaximum = maximums.reduce((acc, max) => max > acc ? max : acc, -Infinity);
    }

    if (!fromZero) {
      newMinimum = minimums.reduce((acc, min) => min < acc ? min : acc, Infinity);
    } else {
      newMinimum = 0;
    }

    // if (newMaximum === -Infinity || !newMaximum) {
    //   return;
    // }

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
    const start = Math.floor(this.offsetLeftAnimation.value * this.xAxis.length);
    const end = Math.ceil(this.offsetRightAnimation.value * this.xAxis.length);

    this.findOverallMaximumAndMinimum('maximum', 'minimum', start, end);

    this.zoomRatio = 1 / (this.offsetRightAnimation.value - this.offsetLeftAnimation.value);
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
    this.gridLineWidth = 1;

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
      this.lineFragmentWidth = this.dimensions.chartWidth / (this.xAxis.length - 1);
    }

    this.setViewportAttributes();
    this.setYAxisLengths();
  }

  setViewportAttributes() {
    this.viewport.setAttribute('width', this.dimensions.width / this.pixelRatio);
    this.viewport.setAttribute('height', this.dimensions.height / this.pixelRatio);

    this.absoluteViewport.setAttribute('width', this.dimensions.width / this.pixelRatio);
    this.absoluteViewport.setAttribute('height', this.dimensions.height / this.pixelRatio);
    this.canvas.setAttribute('width', this.dimensions.width);
    this.canvas.setAttribute('height', this.dimensions.chartHeight);

    this.canvas.style.height = this.dimensions.chartHeight / this.pixelRatio + 'px';

    if (!this.offsetWrapper) {
      return;
    }

    this.offsetAbsoluteViewport.setAttribute('width', this.dimensions.offsetWidth);
    this.offsetAbsoluteViewport.setAttribute('height', this.dimensions.offsetHeight);
    this.offsetCanvas.setAttribute('width', this.dimensions.offsetWidth);
    this.offsetCanvas.setAttribute('height', this.dimensions.offsetHeight);
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

  renderCanvasXTicks() {
    this.renderXTicks();
    this.context.clearRect(0, this.dimensions.chartHeight, this.dimensions.width, 25 * this.pixelRatio);
    this.context.font = `${10 * this.pixelRatio}px Helvetica, sans-serif`;

    for (let [index, tick] of this.xTicks) {
      if (this.chartType === 'circle' && tick.opacity.to !== 0) {
        this.animate(tick.opacity, 0);
      }
      if (tick.opacity.to === 0 && tick.opacity.value === 0) {
        tick.element.remove();
        this.xTicks.delete(index);

        continue;
      }
      const position = this.dimensions.chartPadding + (index / (this.xAxis.length - 1) - this.offsetLeftAnimation.value) * this.dimensions.chartWidth * this.zoomRatio;
      if (this.updateAnimation(tick.opacity)) this.needRedraw = true;

      tick.element.setAttribute('x', position);
      tick.element.style.opacity = tick.opacity.value;
    }
  }

  renderXTicks() {
    let needAnimation = false;

    if (this.chartType === 'circle') return;

    const comfortableCount = Math.floor(this.xAxis.length / 6);
    const tickInterval = Math.ceil(Math.log2(Math.round(comfortableCount / this.zoomRatio)));
    const ticksCount = Math.ceil(this.xAxis.length / 2 ** tickInterval * this.zoomRatio);

    if (this.xTicksInterval && this.xTicksInterval !== tickInterval) {
      needAnimation = true;
      for (let [index, tick] of this.xTicks) {
        if (index % (2 ** tickInterval) !== 0) {
          // fade out tick
          this.animate(tick.opacity, 0);
        }
      }
    }

    this.xTicksInterval = tickInterval;

    for (let i = 0; i < ticksCount; i++) {
      const newIndex = i * 2 ** tickInterval;
      const position = this.chartPadding + (newIndex / (this.xAxis.length - 1) - this.offsetLeftAnimation.value) * this.dimensions.chartWidth * this.zoomRatio;
      const value = this.xAxis[newIndex];

      if (!value) {
        continue;
      }

      const tick = this.xTicks.get(newIndex);

      if (position + this.chartPadding * 2 >= 0 && position - this.chartPadding <= this.dimensions.width) {
        if (!tick) {
          const tick = this.createXTick(newIndex);

          if (needAnimation) {
            this.setAnimation(tick.opacity, 0);
            this.animate(tick.opacity, 1);
          }

          this.xTicks.set(newIndex, tick);
          this.xAxisViewport.appendChild(tick.element);
        } else if (needAnimation && this.hasAnimation(tick.opacity)) {
          this.animate(tick.opacity, 1);
        }
      } else if (tick) {
        tick.element.remove();
        this.xTicks.delete(newIndex);
      }
    }
  }

  createXTick(index) {
    const tick = createElementNS('text');

    if (index === 0) {
      tick.classList.add('chart__x-axis-start');
    }

    if (index === this.xAxis.length - 1) {
      tick.classList.add('chart__x-axis-end');
    }

    tick.textContent = this.getUTCDateLabel(this.xAxis[index]);

    return {
      element: tick,
      opacity: this.createAnimation(1)
    };
  }

  renderCanvasYTicks() {
    this.renderYTicks();

    for (let [index, tick] of this.yTicks) {
      if (this.chartType === 'circle' && tick.opacity.to !== 0) {
        this.animate(tick.opacity, 0);
      }
      if (tick.opacity.to === 0 && tick.opacity.value === 0) {
        tick.element.remove();
        this.yTicks.delete(index);

        continue;
      }
      let maximum = this.maximum.value;
      let minimum = this.minimum.value;

      if (this.yScaled) {
        maximum = this.lines[0].maximum.value;
        minimum = this.lines[0].minimum.value;
      }

      if (this.yScaled) {
        for (let i = 0; i < this.lines.length; i++) {
          tick.values[i].style.opacity = this.lines[i].visible ? 1 : 0;
        }
      }

      const coord = (maximum - index) / (maximum - minimum) * this.dimensions.chartHeight;
      if (this.updateAnimation(tick.opacity)) this.needRedraw = true;

      tick.element.setAttribute('transform', `translate(0, ${coord})`);
      tick.element.style.transform = `translate(0, ${coord}px)`;
      tick.element.style.opacity = tick.opacity.value;

      // this.renderCanvasYTick(index, tick, coord);
    }
  }

  renderYTicks() {
    if (this.chartType === 'circle') return;

    const requiredTicks = 6;
    let maximum = this.maximum.to;
    let minimum = this.minimum.to;

    if (this.yScaled) {
      maximum = this.lines[0].maximum.to;
      minimum = this.lines[0].minimum.to;
    }

    const yTickInterval = tickIncrement(minimum, maximum, requiredTicks);
    const yTicksCount = Math.ceil((maximum - minimum) / yTickInterval);

    if (this.yTicksCount && this.yTicksInterval && yTicksCount === this.yTicksCount && yTickInterval === this.yTicksInterval) {
      return;
    }

    this.yTicksCount = yTicksCount;
    this.yTicksInterval = yTickInterval;

    const shouldAnimate = this.yTicks.size !== 0;

    for (let [index, tick] of this.yTicks) {
      if (this.yTicks.size && (index % (minimum + yTickInterval) !== 0) || maximum === -Infinity || maximum === 0) {
        this.animate(tick.opacity, 0);
      }
    }

    for (let i = 0; i < yTicksCount; i++) {
      const values = [];

      if (this.yScaled) {
        for (let j = 0; j < this.lines.length; j++) {
          const interval = tickIncrement(this.lines[j].minimum.to, this.lines[j].maximum.to, requiredTicks);
          const value = this.lines[j].minimum.to + i * interval;

          values.push(value);
        }
      } else {
        const value = this.minimum.to + i * yTickInterval;

        values.push(value);
      }

      const tick = this.yTicks.get(values[0]);

      if (!tick) {
        const tick = this.createYTick(values);

        if (shouldAnimate) {
          this.setAnimation(tick.opacity, 0);
          this.animate(tick.opacity, 1);
        }

        this.yTicks.set(values[0], tick);

        this.yAxisViewport.appendChild(tick.element);
      } else {
        if (shouldAnimate) {
          this.animate(tick.opacity, 1);
        }
      }
    }
  }

  createYTick(values) {
    const tick = createElementNS('g');
    const tickLine = createElementNS('line', {
      x1: this.chartPadding,
      y1: '0',
      x2: this.chartPadding + this.dimensions.chartWidth,
      y2: '0'
    });

    let valueLabels = [];

    if (this.yScaled) {
      for (let i = 0; i < this.lines.length; i++) {
        const tickLabel = createElementNS('text', {
          x: i === 0 ? this.chartPadding : this.chartPadding + this.dimensions.chartWidth,
          y: '-5px'
        });

        if (values[i] === this.minimum) {
          tick.classList.add('.chart__y-line');
        }

        if (i !== 0) {
          tickLabel.style.textAnchor = 'end';
        }

        tickLabel.dataset.id = this.lines[i].id;
        tickLabel.style.opacity = this.lines[i].visible ? 1 : 0;
        tickLabel.style.fill = this.lines[i].color;

        tickLabel.textContent = this.getYLabel(values[i]);

        valueLabels.push(tickLabel);

        tick.appendChild(tickLabel);
      }
    } else {
      const tickLabel = createElementNS('text', {
        x: this.chartPadding,
        y: '-5px'
      });

      if (values[0] === this.minimum) {
        tick.classList.add('.chart__y-line');
      }

      tickLabel.textContent = this.getYLabel(values[0]);
      valueLabels.push(tickLabel);

      tick.appendChild(tickLabel);
    }


    tick.appendChild(tickLine);

    return {
      element: tick,
      values: valueLabels,
      opacity: this.createAnimation(1)
    };
  }

  getUTCDateLabel(time) {
    const date = new Date(time);

    if (this.zoomedIn) {
      return `${getTrailingZeroes(date.getUTCHours())}:${getTrailingZeroes(date.getUTCMinutes())}`
    }

    return months[date.getUTCMonth()].slice(0, 3) + ' ' + date.getUTCDate();
  }

  getYLabel(value) {
    return value;

    // if (value / 1000000 ^ 0 > 0) {
    //   return (value / 1000000 ^ 0) + 'M'
    // } else if (value / 1000 ^ 0 > 0) {
    //   return (value / 1000 ^ 0) + 'k'
    // } else {
    //   return value;
    // }
  }

  renderCanvasCircle() {
    const left = Math.floor(this.offsetLeftAnimation.to * this.xAxis.length);
    const right = Math.ceil(this.offsetRightAnimation.to * this.xAxis.length);
    const prevLeft = Math.floor(this.offsetLeftAnimation.from * this.xAxis.length);
    const prevRight = Math.ceil(this.offsetRightAnimation.from * this.xAxis.length);
    const centerX = this.dimensions.width / 2;
    const centerY = this.dimensions.chartHeight / 2;
    const radius = this.dimensions.chartHeight / 2;

    let total = 0;
    let prevTotal = 0;
    const values = new Array(this.lines.length);
    const prevValues = new Array(this.lines.length);

    for (let i = 0; i < this.lines.length; i++) {
      if (!this.lines[i].opacity.value) continue;
      for (let j = left; j < right; j++) {
          if (!values[i]) {
            values[i] = 0;
          }
          values[i] += this.lines[i].data[j] * this.lines[i].opacity.value;
      }
      for (let j = prevLeft; j < prevRight; j++) {
        if (!prevValues[i]) {
          prevValues[i] = 0;
        }
        prevValues[i] += this.lines[i].data[j] * this.lines[i].opacity.value;
      }
      total += values[i];
      prevTotal += prevValues[i];
    }

    let start = 0;

    for (let i = 0; i < this.lines.length; i++) {
      if (!this.lines[i].opacity.value) continue;
      this.context.beginPath();
      this.context.fillStyle = this.lines[i].color;
      let phi = start + values[i] / total * 2 * Math.PI;
      if (left !== prevLeft || right !== prevRight) {
        let p = (this.offsetLeftAnimation.result + this.offsetRightAnimation.result) / 2;

        phi = start + (prevValues[i] - (prevValues[i] - values[i]) * p) / (prevTotal - (prevTotal - total) * p) * 2 * Math.PI;
      }

      if (this.selectedX >= 0 && i === this.selectedX) {
        const offsetPhi = (phi + start) / 2;
        const offsetX = this.selectedAnimation.value * 10 * Math.cos(offsetPhi);
        const offsetY = this.selectedAnimation.value * 10 * Math.sin(offsetPhi);

        this.context.moveTo(centerX + offsetX, centerY + offsetY);
        this.context.arc(centerX + offsetX, centerY + offsetY, radius, start, phi);
        this.context.lineTo(centerX + offsetX, centerY + offsetY);
      } else {
        this.context.moveTo(centerX, centerY);
        this.context.arc(centerX, centerY, radius, start, phi);
        this.context.lineTo(centerX, centerY);
      }

      this.context.closePath();
      this.context.fill();

      start = phi;
    }
  }

  renderCanvasLines() {
    this.context.clearRect(0, 0, this.dimensions.chartPadding * 2 + this.dimensions.chartWidth, this.dimensions.chartHeight);
    this.context.lineWidth = this.mainLineWidth;
    const offset = this.dimensions.chartPadding - this.offsetLeftAnimation.value * this.dimensions.chartWidth * this.zoomRatio;
    let maximum = this.maximum.value;
    let minimum = this.minimum.value;
    let left = Math.floor(this.offsetLeftAnimation.value * this.xAxis.length - this.dimensions.chartPadding / this.fragmentWidth);
    let right = Math.ceil(this.offsetRightAnimation.value * this.xAxis.length + this.dimensions.chartPadding / this.fragmentWidth);
    let w = this.fragmentWidth * this.zoomRatio;

    if (this.chartType === 'lines' || this.chartType === 'areas') {
      w = this.lineFragmentWidth * this.zoomRatio;
    }

    if (left < 0) left = 0;
    if (right > this.xAxis.length) right = this.xAxis.length;

    if (this.chartType === 'circle') {
      this.renderCanvasCircle();

      return;
    }

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

    if (this.chartType === 'lines' || this.chartType === 'areas') {
      w = this.lineFragmentWidth / this.pixelRatio;
    }

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
    } else if (this.chartType === 'bars' || this.chartType === 'circle') {
      context.fillStyle = line.color;
      context.globalAlpha = 1;

      const maximums = new Array(right - left);

      if (this.percentage) {
        for (let i = left; i < right; i++) {
          maximums[i] = 0;

          for (let j = 0; j < this.lines.length; j++) {
            if (!this.lines[j].opacity.value) continue;

            maximums[i] += this.lines[j].data[i] * this.lines[j].opacity.value;
          }
        }
      }

      for (let i = left; i < right; i++) {
        const x = w * i + offset;

        if (this.selectedX >= 0 && context === this.context) {
          context.globalAlpha = 0.5;
        }

        let value = line.data[i];
        let bottom = minimum;

        if (this.stacked) {
          for (let j = 0; j < index; j++) {
            bottom += this.lines[j].data[i] * this.lines[j].opacity.value;
          }

          value += bottom;
        }

        let y = ((maximum - value) / (maximum - minimum) * height);
        let h = ((maximum - bottom) / (maximum - minimum) * height) - y;

        if (this.percentage) {
          y = (maximums[i] - value) / maximums[i] * height;
          h = ((maximums[i] - bottom) / maximums[i] * height) - y;
        }

        if (this.selectedX === i) {
          context.globalAlpha = 1;
          context.fillRect(x, y + h * (1 - opacity), w, h * opacity);
        } else {
          context.rect(x, y + h * (1 - opacity), w, h * opacity);
        }
      }

      context.fill();
    } else if (this.chartType === 'areas') {
      context.fillStyle = line.color;

      const maximums = new Array(right - left);

      if (this.percentage) {
        for (let i = left; i < right; i++) {
          maximums[i] = 0;

          for (let j = 0; j < this.lines.length; j++) {
            if (!this.lines[j].opacity.value) continue;

            maximums[i] += this.lines[j].data[i] * this.lines[j].opacity.value;
          }
        }
      }

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

        let y = ((maximum - value) / (maximum - minimum) * height);
        let h = ((maximum - bottom) / (maximum - minimum) * height) - y;

        if (this.percentage) {
          y = (maximums[i] - value) / maximums[i] * height;
          h = ((maximums[i] - bottom) / maximums[i] * height) - y;
        }

        if (i === left) {
          context.moveTo(x, y + h * (1 - opacity));
        } else {
          context.lineTo(x, y + h * (1 - opacity));
        }
      }

      for (let i = right - 1; i >= left; i--) {
        const x = w * i + offset;

        let value = line.data[i];
        let bottom = minimum;

        if (this.stacked) {
          for (let j = 0; j < index; j++) {
            bottom += this.lines[j].data[i] * this.lines[j].opacity.value;
          }

          value += bottom;
        }

        let h = ((maximum - bottom) / (maximum - minimum) * height);

        if (this.percentage) {
          h = (maximums[i] - bottom) / maximums[i] * height;
        }

        context.lineTo(x, h);
      }

      context.closePath();
      context.fill();
    }
  }

  setLine(label, line, enabled = false) {
    line.visible = enabled;

    this.animate(line.opacity, enabled ? 1 : 0);

    this.findOffsetMaximumAndMinimum();

    if (enabled) {
      label.classList.remove('chart__toggle-check_disabled');
    } else {
      label.classList.add('chart__toggle-check_disabled');
    }

    this.needOffsetRedraw = true;
    this.render();
  }

  renderInfo() {
    if (this.selectedX < 0 || this.selectedX >= this.xAxis.length || this.maximum.to === -Infinity) {
      if (this.infoViewport) {
        this.infoViewport.style.display = 'none';
      }

      return;
    }

    this.infoViewport.style.display = 'block';

    const {weekLabel, values: {wrapper: valuesG, values}, xInfoRect, xInfoG, circles, xLine} = this.infoData;

    const selectedElement = this.xAxis[this.selectedX];

    const week = new Date(selectedElement);
    let label = `${weeks[week.getUTCDay()].slice(0, 3)}, ${week.getUTCDate()} ${months[week.getUTCMonth()].slice(0, 3)} ${week.getUTCFullYear()}`;
    if (this.zoomedIn) {
      label = `${getTrailingZeroes(week.getUTCHours())}:${getTrailingZeroes(week.getUTCMinutes())}`;
    }
    const offset = this.chartPadding + (this.selectedX / (this.xAxis.length - 1) - this.offsetLeft) * this.dimensions.chartWidth * this.zoomRatio;

    this.infoViewport.setAttribute('transform', `translate(${offset}, 0)`);

    let invisibleItems = 0;

    if (this.chartType === 'bars') {
      xLine.style.display = 'none';
    } else {
      xLine.style.display = 'block';
    }

    let lineHeight = 0;

    this.lines
      .forEach((line, index) => {
        if (!values.has(line.id)) {
          const elem = createElementNS('text');
          const label = createElementNS('tspan');
          label.classList.add('chart__info-label');
          label.textContent = line.name;
          const value = createElementNS('tspan', {
            fill: line.color
          });
          value.classList.add('chart__info-value');
          elem.appendChild(value);
          elem.appendChild(label);

          values.set(line.id, elem);

          valuesG.appendChild(elem);
        }

        const elem = values.get(line.id);
        const circle = circles.get(line.id);

        if (circle) {
          if (!line.visible || this.chartType !== 'lines') {
            circle.style.display = 'none';
          } else {
            circle.style.display = 'block';
          }

          if (this.maximum.to === -Infinity) {
            return;
          }

          let cy = (this.maximum.to - line.data[this.selectedX]) / (this.maximum.to - this.minimum.to) * this.dimensions.chartHeight;

          if (this.yScaled) {
            cy = (line.maximum.to - line.data[this.selectedX]) / (line.maximum.to - line.minimum.to) * this.dimensions.chartHeight;
          }

          circle.setAttribute('cy', cy + 'px');
        }

        if (!line.visible) {
          elem.style.display = 'none';
          invisibleItems--;

          return;
        } else {
          elem.style.display = 'block';
        }

        lineHeight += line.data[this.selectedX];

        const currentIndex = index + invisibleItems;
        const value = elem.querySelector('.chart__info-value');
        const label = elem.querySelector('.chart__info-label');

        if (!value || !label) {
          return line.data[this.selectedX];
        }

        value.setAttribute('x', 123 + 'px');
        value.setAttribute('y', (40 + 20 * currentIndex) + 'px');
        label.setAttribute('y', (40 + 20 * currentIndex) + 'px');
        label.setAttribute('x', -13 + 'px');

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

    // const infoRectWidth = Math.round(Math.max(weekBB.width, labelsBB.width) + 20);
    // const infoRectHeight = Math.round(weekBB.height + labelsBB.height + 25);
    const infoRectWidth = 160;
    const infoRectHeight = Math.round(weekBB.height + labelsBB.height + 16 );
    const xRect = -143;

    xInfoG.setAttribute('transform', `translate(${xRect}, 0)`);

    if (offset - this.chartPadding * 3 - 5 + xRect < 0) {
      xInfoG.setAttribute('transform', `translate(${this.chartPadding * 3 + 5}, 0)`);
    }

    xInfoRect.setAttribute('width', infoRectWidth + 'px');
    xInfoRect.setAttribute('height', infoRectHeight + 'px');
  }

  render() {
    this.findMaximumAndMinimum();
    this.renderOffsets();
    this.renderInfo();

    this.needRedraw = true;
  }

  renderDateLabel() {
    if (!this.dateLabel) {
      return;
    }

    const left = Math.round(this.xAxis.length * this.offsetLeft);
    const right = Math.round((this.xAxis.length - 1) * this.offsetRight);
    const leftDate = new Date(this.xAxis[left]);
    const rightDate = new Date(this.xAxis[right]);

    if (rightDate - leftDate <= 60 * 60 * 24 * 1000) {
      this.dateLabel.innerText = `${weeks[leftDate.getUTCDay()]}, ${leftDate.getUTCDate()} ${months[leftDate.getUTCMonth()]} ${leftDate.getFullYear()}`;
    } else {
      this.dateLabel.innerText = `${leftDate.getUTCDate()} ${months[leftDate.getUTCMonth()]} ${leftDate.getUTCFullYear()} - ${rightDate.getUTCDate()} ${months[rightDate.getUTCMonth()]} ${rightDate.getUTCFullYear()}`;
    }
  }

  renderCanvas() {
    if (this.updateAnimation(this.maximum)) this.needRedraw = true;
    if (this.updateAnimation(this.minimum)) this.needRedraw = true;

    if (this.updateAnimation(this.selectedAnimation)) this.needRedraw = true;

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
      if (this.zoomedIn) {
        this.findMaximumAndMinimum();
        this.renderOffsets();
        this.renderInfo();
      }
      this.renderCanvasLines();
      this.renderCanvasYTicks();
      this.renderCanvasXTicks();
    }

    if (this.needOffsetRedraw) {
      this.needOffsetRedraw = false;
      this.renderCanvasOffsetLines();
    }

    if (this.needRedrawDrags) {
      this.needRedrawDrags = false;

    }

    requestAnimationFrame(() => this.renderCanvas());
  }
}