/** 
 * @license
 * Code licensed under GPLv3 (see https://github.com/jdclarke5/british-succession).
 */

import { LitElement, html, css } from 'lit-element';
import * as d3 from './node_modules/d3/index.js';

export class SuccessionApp extends LitElement {

  static get properties() {
    return {
      loading: {type: Boolean},
      successors: { type: Array },
      rowsAdded: { type: Number },
      selectedDate: {type: Object},
      selectedSuccessor: {type: String},
    };
  }

  constructor() {
    super();
    // Component properties
    this.loading = true;
    this.successors = [];
    this.rowsAdded = 0;
    this.selectedDate = null;
    this.selectedSuccessor = null;
    // Configuration variables
    this.rowBatchSize = 500;
    // Sampling rate for chart in months (must be <= 12) 
    this.sampling = 2;
    // Number of samples either side to smooth (max) lines over
    this.smoothing = 8;
    // Chart dimensions
    this.aspectRatio = 10/4;
    // X axis from George I reign to the last updated time
    this.minDate = this._stringToDate('1714-08-01'); 
    this.lastUpdated = null;
    // Y axis extent
    this.minY = 0;
    this.maxY = 100;
    // Zoom maximum
    this.maxZoom = 2;
    // Below sets dimensions based on the container width,
    // then rescales some sampling and range for smaller screens 
    // (based on the base design for 1000px maximum)
    const width = this.clientWidth;
    this.dimensions = {width: width, height: width / this.aspectRatio};
    const scaleFactor = Math.ceil(1000 / width);
    this.sampling = Math.min(this.sampling * scaleFactor, 12);
    this.maxY = this.maxY / scaleFactor;
  }

  static get styles() {
    return css`

      main {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      #chart-header {
        font-size: 0.7em;
        color: #555;
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 0.4em;
      }

      .chart-header-item {
        display: flex;
        flex-direction: row;
        align-items: center;
      }

      #chart-header > div > span {
        padding: 0 0.4em;
      }

      #chart-header > div > img {
        width: 1.6em;
        cursor: pointer;
      }

      #chart-header > div > img[disabled] {
        cursor: default;
        opacity: 0.4;
      }
  
      #chart-container {
        position: relative;
        padding: 0 0 8px;
        text-align: center;
      }

      svg {
        overflow: visible;
      }

      .border {
        stroke: black;
        stroke-width: 1px;
      }

      .tick > line {
        opacity: 0.2;
      }

      .chart-label {
        font-size: 11px;
        text-align: center;
      }

      #chart-label-x {
        margin-top: 11px;
      }

      #chart-label-y-left {
        position: absolute;
        height: 100%;
        width: 0;
        white-space: nowrap;
      }
      
      #chart-label-y-left > span {
        position: absolute;
        top: 50%;
        transform: translateX(-50%) translateY(-50%) rotate(-90deg);
        margin-left: -8px;
      }

      #chart-label-y-right {
        position: absolute;
        height: 100%;
        width: 0;
        white-space: nowrap;
        right: 0;
      }

      #chart-label-y-right > span {
        position: absolute;
        top: 50%;
        transform: translateX(-50%) translateY(-50%) rotate(90deg);
        margin-left: 8px;
      }

      #table-header {
        font-size: 0.7em;
        color: #555;
      }

      #table-container {
        width: 100%;
        overflow-y: scroll;
        min-height: 0;
        flex: 1;
      }

      table {
        font-size: 0.8em;
        margin: auto;
        text-align: center;
        border-collapse: collapse;
        cursor: default;
      }

      /** Apply sticky to elements within thead for Chrome compatibility 
      /** Negative top to fix seeing row content above sticky in Chrome */
      thead tr:nth-child(1) th{
        position: sticky;
        top: -2px;
        background: white;
        color: #233580;
      }

      td, th {
        padding: 0.2em;
        padding-left: 0.7em;
        padding-right: 0.7em;
      }

      tr[selected] {
        background-color: rgba(35,53,128,0.2);
      }

      .external-link {
        width: 0.7em;
      }

      .num-col {
        color: #233580;
        font-size: 0.7em;
      }

      .name-col {
        text-align: left;
        max-width: 28em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      
      .date-col {
        width: 9em;
      }

      .spinner {
        border: 4px solid #eee;
        border-top: 4px solid #233580;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        animation: spin 1s linear infinite;
        position: absolute;
        left: calc(50% - 12px);
        top: calc(50% - 12px);
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      @media screen and (max-device-width: 480px) and (orientation: portrait), (max-width: 720px){
        .date-col {
          display: none;
        }
      }

      @media screen and (max-device-width: 640px) and (orientation: landscape), (max-height: 720px) {
        #table-container, #table-header {
          display: none;
        }
      }

      *::-webkit-scrollbar {
        width: 4px;
      }
      *::-webkit-scrollbar-track {
        background: transparent;
      }
      *::-webkit-scrollbar-thumb {
        background-color: #aaa;
        border-radius: 2px;
      }

    `;
  }

  render() {

    const renderTableRows = () => {
      if (!this.selectedDate) {
        return null;
      }
      const selectedDate = this._dateToString(this.selectedDate);
      let rows = [];
      let numInLine = 0;
      for (let i = 0; i < this.successors.length; i++) {
        let skip = false;
        const successor = this.successors[i];
        const selected = (this.selectedSuccessor == successor._id);
        // Filter out rows by display none
        // This allows to call scrollIntoView on all rows
        if (
          // Skip unborn
          (successor.birth_date > selectedDate) ||
          // Skip dead
          (successor.death_date && successor.death_date < selectedDate) ||
          // Skip illegitimate
          (successor.illegitimate_date && (successor.illegitimate_date <= selectedDate)) ||
          // Skip not yet legitimate
          (successor.legitimate_date && successor.legitimate_date > selectedDate) 
        ) {
          skip = true;
        }
        // Passed the cull
        const row = html`
          <tr ?selected=${selected} _id="${successor._id}" 
              style="display: ${(selected || !skip) ? 'table-row' : 'none'};"
              @mouseover=${() => this.selectSuccessor(successor._id)}
              @mouseout=${() => this.selectSuccessor(null)}>
            <td class="num-col">${!skip ? numInLine : '-'}</td>
            <td class="name-col">${successor.name}</td>
            <td class="date-col">${successor.birth_date}</td>
            <td class="date-col">${successor.death_date || '-'}</td>
            <td><a href="${successor.external_url}" target="_blank"><img src="./static/link.svg" class="external-link"></a></td>
          </tr>
        `;
        rows.push(row);
        !skip && (numInLine = numInLine + 1);
      }
      return rows;
    }

    return html`

      <style>
        path[_id="${this.selectedSuccessor}"], circle[_id="${this.selectedSuccessor}"] {
          stroke: #233580;
          stroke-width: 3px;
        }
      </style>

      <main>
      
        <section id="chart-container">
          <div id="chart-label-y-left" class="chart-label"><span>Order in Line</span></div>
          <div id="chart-label-y-right" class="chart-label"><span>Order in Line</span></div>
          <header id="chart-header">
            <div class="chart-header-item">
              <img src="./static/add.svg" @click=${this.addRows} 
                ?disabled=${this.rowsAdded === this.successors.length}> 
              <span>Showing <b>${this.rowsAdded}</b> of <b>${this.successors.length}</b> successors</span>
            </div>
            <div class="chart-header-item">
              <span>Reset</span>
              <img src="./static/reset.svg" @click=${this.successors.length && this.resetChart}
                ?disabled=${!this.successors.length}>
            </div>
          </header>
          ${this.loading ? html`<div class="spinner"></div>` : null}
          <svg id="chart" @contextmenu=${this.onRightClick}></svg>
          <div id="chart-label-x" class="chart-label"><span>Date</span></div>
        </section>

        <header id="table-header">
          Line of succession as of
          <b>${this.selectedDate ? this._dateToString(this.selectedDate): '-'}</b>
        </header>
        <section id="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th class="name-col">Name</th>
                <th class="date-col">Born</th>
                <th class="date-col">Died</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${renderTableRows(this.selectedSuccessor)}
            </tbody>
          </table>
        </section>
      
      </main>
    `;
  }

  firstUpdated() {
    // Initialise the chart
    this.initChart();
    // Load the successors
    this.getSuccessors();
  }

  getSuccessors() {
    let url = new URL('/static/successors.json', window.location.origin);
    fetch(url, {
      method: 'GET',
    })
    .then(res => {
      return res.json();
    })
    .then(data => {
      // Get the last updated time and set the selected date
      this.lastUpdated = new Date(data.last_updated);
      this.selectedDate = this.lastUpdated;
      // The successors list
      // Illegitimates are removed (TODO: Make this optional)
      this.successors = data.successors.filter( el =>
        !( el.illegitimate_date && (el.illegitimate_date <= el.birth_date) ));
      // Create the sampling array for chart line heights
      const firstSamplingDate = this._toSample(
        this._stringToDate(this.successors[0].birth_date));
      const lastSamplingDate = this._addSample(this._toSample(this.lastUpdated), 1);
      this.heights = {x: [lastSamplingDate], y: [0]};
      while (this.heights.x[0] > firstSamplingDate) {
        const date = this._addSample(this.heights.x[0], -1);
        this.heights.x.unshift(date);
        this.heights.y.unshift(0);
      }
      // Set the chart
      this.resetChart();
      // Add first set of rows
      this.addRows();
    });
  }

  initChart() {
    // Chart SVG container
    this.svg = d3.select(this.shadowRoot.querySelector('svg'))
      .style('background-color', 'transparent')
      .attr('width', this.dimensions.width)
      .attr('height', this.dimensions.height)
    this.defs = this.svg.append('defs')
    // Clip path to prevent drawing lines outside of their area
    this.defs.append('clipPath')
      .attr('id', 'clip')
      .append('rect')
      .attr('width', this.dimensions.width)
      .attr('height', this.dimensions.height);
    // Arrow marker head
    this.defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 0 10 10')
      .attr('refX', 10)
      .attr('refY', 5)
      .attr('markerWidth', 3)
      .attr('markerHeight', 3)
      .attr('orient', 'auto-start-reverse')
      .append('path')
      .attr('d', 'M 0 0 L 10 5 L 0 10 z');
    // Define time axis
    this.xAxisElem = this.svg.append('g')
      .attr('id', 'x-axis')
      .attr('transform', `translate(0, ${this.dimensions.height})`)
      .classed('axis', true);
    // Rectangle for border and hover/zoom event listener
    this.zoom = d3.zoom()
      .scaleExtent([1, this.maxZoom])
      .translateExtent([[0, 0], [this.dimensions.width, this.dimensions.height]])
      .on('zoom', () => this.onZoom());
    this.rect = this.svg.append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', this.dimensions.width)
      .attr('height', this.dimensions.height)
      .attr('fill', 'transparent')
      .classed('border', true)
      .on('mousemove', () => this.onMouseMove())
      .on('mouseout', () => this.onMouseOut())
      .on('click', () => this.onClick())
      .call(this.zoom);
    // Group to hold all successor lines
    this.paths = this.svg.append('g')
      .attr('clip-path', 'url(#clip)')
      .append('g')
      .on('mousemove', () => this.onMouseMove())
      .on('mouseout', () => this.onMouseOut())
      .on('click', () => this.onClick())
      .call(this.zoom);
    // Date selection arrows
    this.focusArrow = this.svg.append('line')
      .attr('opacity', 0)
      .attr('y1', this.dimensions.height + 20)
      .attr('y2', this.dimensions.height)
      .attr('stroke', 'black')
      .attr('stroke-width', 3)
      .attr('marker-end', 'url(#arrow)');
    this.selectedArrow = this.svg.append('line')
      .attr('opacity', 1)
      .attr('x1', this.dimensions.width)
      .attr('x2', this.dimensions.width)
      .attr('y1', this.dimensions.height + 20)
      .attr('y2', this.dimensions.height)
      .attr('stroke', 'black')
      .attr('stroke-width', 3)
      .attr('marker-end', 'url(#arrow)');
  }

  resetChart() {
    // Set the domain extents
    this.xScale = d3.scaleTime()
      .range([0, this.dimensions.width])
      .domain([this.minDate, this.lastUpdated]);
    this.xAxis = d3.axisBottom(this.xScale)
      .tickSizeInner(-this.dimensions.height) // (gridlines)
      .tickSizeOuter(0);
    this.xAxisElem.call(this.xAxis);
    this.yScale = d3.scaleLinear()
      .range([this.dimensions.height, 0])
      .domain([this.minY, this.maxY]);
    // Reset zoom state
    this.zoomedXScale = undefined;
    this.zoomedYScale = undefined;
    this.rect.call(this.zoom.transform, d3.zoomIdentity);
    this.paths.call(this.zoom.transform, d3.zoomIdentity);
    // Reset selected date
    this.selectedDate = this.lastUpdated;
    this.selectedArrow
      .attr('x1', this.dimensions.width)
      .attr('x2', this.dimensions.width);
    this.selectedArrow.call(this.zoom.transform, d3.zoomIdentity);
  }

  onZoom() {
    // Get default transform values
    const transform = d3.event.transform;
    const k = transform.k;
    const tX = transform.x;
    const tY = transform.y;
    // Hack to ensure zoomable elements are in sync 
    this.rect.node().__zoom = transform;
    this.paths.node().__zoom = transform;
    // Transform the x axis
    this.zoomedXScale = transform.rescaleX(this.xScale);
    this.xAxis.scale(this.zoomedXScale);
    this.xAxisElem.call(this.xAxis);
    // Transform the paths
    this.paths.attr(
      'transform', `translate(${tX}, ${tY}) scale(${k})`);
    // Translate the selectedArrow and hide if outside x range
    const selectedArrowX = this.selectedArrow.node().x1.baseVal.value;
    const selectedArrowZoomedX = k * selectedArrowX + tX;
    const selectedArrowVisible = (selectedArrowZoomedX >= 0 
      && selectedArrowZoomedX <= this.dimensions.width);
    this.selectedArrow.attr('opacity', Number(selectedArrowVisible))
      .attr('transform', `translate(${selectedArrowZoomedX - selectedArrowX})`);
  }

  onMouseMove() {
    const rect = this.rect.node();
    const mouse = d3.mouse(rect);
    const mouseX = mouse[0];
    this.focusArrow
      .attr("x1", mouseX)
      .attr("x2", mouseX)
      .attr("opacity", 0.5);
  }

  onMouseOut() {
    this.focusArrow.attr("opacity", 0);
  }

  onClick() {
    const rect = this.rect.node();
    const mouse = d3.mouse(rect);
    const mouseX = mouse[0];
    const xScale = this.zoomedXScale || this.xScale;
    const clickDate = xScale.invert(mouseX);
    if (clickDate > this.lastUpdated) {
      this.selectedDate = this.lastUpdated;
    } else if (clickDate < this.minDate) {
      this.selectedDate = this._addSample(this._toSample(this.minDate), 1);
    } else {
      this.selectedDate = clickDate;
    }
    const selectedArrowX = this.xScale(this.selectedDate);
    const transform = this.rect.node().__zoom;
    const k = transform.k;
    const tX = transform.x;
    this.selectedArrow
      .attr("x1", selectedArrowX)
      .attr("x2", selectedArrowX)
      .attr('transform', `translate(${k * selectedArrowX + tX - selectedArrowX})`);
  }

  addRows() {
    this.loading = true;
    for (let i = 0; i < this.rowBatchSize; i++) {
      this.addRow();
    }
    this.loading = false;
  }

  addRow() {
    // Return if nothing to add
    if (this.rowsAdded == this.successors.length) {
      return;
    }
    // Successor to add
    const successor = this.successors[this.rowsAdded];
    // Get start/end dates for line
    const startDate = this._stringToDate(successor.legitimate_date 
      || successor.birth_date);
    const endDate = this._stringToDate(successor.illegitimate_date 
      || successor.death_date || this._dateToString(this.lastUpdated));
    const startsBeforeMinDate = (startDate < this.minDate);
    // Start is snapped to left of sampling, end is snapped to right of sampling
    const sampledStartDate = this._toSample(startDate);
    const sampledEndDate = this._addSample(this._toSample(endDate), 1);
    // Determine line
    let line = {x: [], y: []};
    let lineStartIndex = undefined;
    let lineMaxHeight = 0;
    for (let i = 0; i < this.heights.y.length; i++) {
      const date = this.heights.x[i];
      // Break if the line has ended
      if (date > sampledEndDate) {
        break;
      }
      // Set lineStartIndex the first time we are past the start
      if (lineStartIndex === undefined) {
        if (date < sampledStartDate || date < this.minDate) {
          continue;
        }
        lineStartIndex = i;
      }
      // Calculate height using a window max
      const iMin = Math.max(0, i - this.smoothing);
      const windowedHeights = this.heights.y.slice(iMin, i + this.smoothing);
      const lineHeight = Math.max(...windowedHeights);
      line.x.push(date);
      const y = lineHeight + 1;
      line.y.push(y);
      lineMaxHeight = Math.max(lineMaxHeight, y);
    };
    // Return if no line (Sophia of Hanover died before this.minDate)
    if (line.y.length < 2) {
      this.rowsAdded += 1;
      return;
    }
    // Overwrite the current heights
    this.heights.y.splice(lineStartIndex, line.y.length, ...line.y);
    // Interpolate the start/end points to lie on startDate and endDate
    const last = line.x.length - 1;
    if (!startsBeforeMinDate) {
      line.y[0] = line.y[0] + (startDate - line.x[0]) / (line.x[1] - line.x[0])
        * (line.y[1] - line.y[0]); 
      line.x[0] = startDate;
    }
    line.y[last] = line.y[last-1] + (endDate - line.x[last-1]) / 
      (line.x[last] - line.x[last-1]) * (line.y[last] - line.y[last-1]); 
    line.x[last] = endDate;
    // Update the zoom translate and scale extent
    const [_, k1] = this.zoom.scaleExtent();
    const [[x0, y0], [x1, y1]] = this.zoom.translateExtent();
    const maxHeightY = this.yScale(lineMaxHeight);
    if (maxHeightY < y0) {
      const minZoom = y1 / (y1 - maxHeightY);
      this.zoom
        .scaleExtent([minZoom, k1])
        .translateExtent([[x0, maxHeightY], [x1, y1]]);
    }
    // Define data array for D3
    // Remove unnecessary intermediate path points to reduce DOM burden
    let d = [];
    for (let i = 0; i < line.x.length; i++) {
      const x = line.x[i];
      const y = line.y[i];
      if (i === 0 || i === last) {
        d.push({x: x, y: y});
      } else {
        // Add only if slope before/after is different
        const slopeBefore = (y - line.y[i-1]) / (x - line.x[i-1]);
        const slopeAfter = (line.y[i+1] - y) / (line.x[i+1] - x);
        if (slopeBefore !== slopeAfter) {
          d.push({x: x, y: y});
        }
      }
    }
    // Attach path element
    const path = d3.line()
      .x( d => this.xScale(d.x))
      .y( d => this.yScale(d.y));
    this.paths.append('path')
      .datum(d)
      .attr('_id', successor._id)
      .attr('fill', 'none')
      .attr('stroke', '#444')
      .attr('stroke-width', 1.6)
      .attr('d', path);
    // Attach a 'ghost' path with wide stroke for hover events
    this.paths.append('path')
      .datum(d)
      .attr('fill', 'none')
      .attr('stroke', 'white')
      .attr('opacity', 0)
      .attr('stroke-width', 8)
      .on('mouseover', () => this.selectSuccessor(successor._id, true))
      .on('mouseout', () => this.selectSuccessor(null, true))
      .attr('d', path);
    // Attach line end circle
    let endCircle = (successor.death_date || successor.illegitimate_date) && this.paths
      .append('circle')
      .attr('_id', successor._id)
      .attr('r', 1.2)
      .attr('cx', this.xScale(line.x[last]))
      .attr('cy', this.yScale(line.y[last]))
      .attr('fill', '#444')
      .attr('stroke', '#444')
      .attr('stroke-width', 1)
      .on('mouseover', () => this.selectSuccessor(successor._id, true))
      .on('mouseout', () => this.selectSuccessor(null, true));
    if (successor.illegitimate_date) {
      endCircle.attr('fill', 'white');
    }
    // Attach line start circle
    let startCircle = !startsBeforeMinDate && this.paths
      .append('circle')
      .attr('_id', successor._id)
      .attr('r', 1.2)
      .attr('cx', this.xScale(line.x[0]))
      .attr('cy', this.yScale(line.y[0]))
      .attr('fill', '#444')
      .attr('stroke', '#444')
      .attr('stroke-width', 1)
      .on('mouseover', () => this.selectSuccessor(successor._id, true))
      .on('mouseout', () => this.selectSuccessor(null, true));
    if (successor.legitimate_date) {
      startCircle.attr('fill', 'white');
    }
    // The row has been added
    this.rowsAdded += 1;
  }

  selectSuccessor(_id, scrollIntoView) {
    if (this.selectedSuccessor === _id) {
      return;
    }
    this.selectedSuccessor = _id;
    const tr = this.shadowRoot.querySelector(`tr[_id="${_id}"]`);
    tr && (tr.style.display = 'table-row');
    // Debounce scrolling to improve UX
    tr && scrollIntoView && setTimeout(() => {
      (this.selectedSuccessor === _id) && tr.scrollIntoView({block: 'center', behavior: 'smooth'});
    }, 200);
  }

  _stringToDate(string) {
    return new Date(`${string}T00:00`);
  }

  _dateToString(date) {
    return date.toISOString().substr(0, 10);
  }

  _toSample(date) {
    const year = 1900 + date.getYear();
    const month = date.getMonth();
    return new Date(year, month - (month % this.sampling), 1);
  }

  _addSample(date, units) {
    const year = 1900 + date.getYear();
    const month = date.getMonth() + units * this.sampling;
    return new Date(year, month , 1);
  }

}

window.customElements.define('succession-app', SuccessionApp);
