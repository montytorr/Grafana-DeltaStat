import {PanelCtrl} from 'app/plugins/sdk';

import moment from 'moment';
import _ from 'lodash';
import $ from 'jquery';
import 'jquery.flot';
import 'jquery.flot.gauge';
import kbn from 'app/core/utils/kbn';
import TimeSeries from 'app/core/time_series2';
import {metricsTabDirective} from 'app/features/panel/metrics_tab';

export class DeltaPluginCtrl extends PanelCtrl {

  constructor($scope, $injector, $rootScope) {
    super($scope, $injector);
    this.$rootScope = $rootScope;

    var panelDefaults = {
      links: [],
      datasource: null,
      maxDataPoints: 100,
      interval: null,
      targets: [{}],
      cacheTimeout: null,
      format: 'none',
      prefix: '',
      postfix: '',
      nullText: null,
      valueMaps: [
        { value: 'null', op: '=', text: 'N/A' }
      ],
      mappingTypes: [
        {name: 'value to text', value: 1},
        {name: 'range to text', value: 2},
      ],
      rangeMaps: [
        { from: 'null', to: 'null', text: 'N/A' }
      ],
      mappingType: 1,
      nullPointMode: 'connected',
      valueName: 'avg',
      prefixFontSize: '50%',
      valueFontSize: '80%',
      postfixFontSize: '50%',
      thresholds: '',
      colorBackground: false,
      colorValue: false,
      colors: ["rgba(245, 54, 54, 0.9)", "rgba(237, 129, 40, 0.89)", "rgba(50, 172, 45, 0.97)"],
      sparkline: {
        show: false,
        full: false,
        lineColor: 'rgb(31, 120, 193)',
        fillColor: 'rgba(31, 118, 189, 0.18)',
      },
      gauge: {
        show: false,
        minValue: 0,
        maxValue: 100,
        thresholdMarkers: true,
        thresholdLabels: false
      },
      tableColumn: '',
      dayInterval: 'NOW',
      hourInterval: 'NOW',
      minuteInterval: 'NOW',
    };

    _.defaults(this.panel, panelDefaults);

    //this.events.on('render', this.onRender.bind(this));
    this.events.on('data-received', this.onDataReceived.bind(this));
    this.events.on('data-error', this.onDataError.bind(this));
    //this.events.on('data-snapshot-load', this.onDataReceived.bind(this));
    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
    this.events.on('refresh', this.OnRefresh.bind(this));

    this.$q = $injector.get('$q');
    this.datasourceSrv = $injector.get('datasourceSrv');
    this.timeSrv = $injector.get('timeSrv');
    this.templateSrv = $injector.get('templateSrv');
    this.scope = $scope;

  }

  onInitEditMode() {
    this.fontSizes = ['20%', '30%','50%','70%','80%','100%', '110%', '120%', '150%', '170%', '200%'];
    this.addEditorTab('Metrics', metricsTabDirective);
    //this.addEditorTab('Metrics', 'public/plugins/grafana-delta-panel/editor.html', 2);
    this.addEditorTab('Options', 'public/app/plugins/panel/singlestat/editor.html', 3);
    this.addEditorTab('Value Mappings', 'public/app/plugins/panel/singlestat/mappings.html', 4);
    this.addEditorTab('Delta', 'public/plugins/grafana-delta-panel/delta_config.html', 5);
    this.unitFormats = kbn.getUnitFormats();
  }

  setUnitFormat(subItem) {
    this.panel.format = subItem.value;
    this.render();
  }

  //GOT FROM https://raw.githubusercontent.com/grafana/grafana/master/public/app/features/panel/metrics_panel_ctrl.ts
  OnRefresh() {
    // ignore fetching data if another panel is in fullscreen
    if (this.otherPanelInFullscreenMode()) { return; }

    // if we have snapshot data use that
    if (this.panel.snapshotData) {
      this.updateTimeRange();
      var data = this.panel.snapshotData;
      // backward compatability
      if (!_.isArray(data)) {
        data = data.data;
      }

      this.events.emit('data-snapshot-load', data);
      return;
    }

    // // ignore if we have data stream
    if (this.dataStream) {
      return;
    }

    // clear loading/error state
    delete this.error;
    this.loading = true;

    // load datasource service
    this.setTimeQueryStart();
    this.datasourceSrv.get(this.panel.datasource)
    .then(this.updateTimeRange.bind(this))
    .then(this.issueQueries.bind(this))
    .then(this.handleQueryResult.bind(this))
    .catch(err => {
      // if cancelled  keep loading set to true
      if (err.cancelled) {
        console.log('Panel request cancelled', err);
        return;
      }

      this.loading = false;
      this.error = err.message || "Request Error";
      this.inspector = {error: err};

      if (err.data) {
        if (err.data.message) {
          this.error = err.data.message;
        }
        if (err.data.error) {
          this.error = err.data.error;
        }
      }

      this.events.emit('data-error', err);
      console.log('Panel data error:', err);
    });
  }

  setTimeQueryStart() {
    this.timing.queryStart = new Date().getTime();
  }

  setTimeQueryEnd() {
    this.timing.queryEnd = new Date().getTime();
  }

  calculateInterval() {
    var intervalOverride = this.panel.interval;

    // if no panel interval check datasource
    if (intervalOverride) {
      intervalOverride = this.templateSrv.replace(intervalOverride, this.panel.scopedVars);
    } else if (this.datasource && this.datasource.interval) {
      intervalOverride = this.datasource.interval;
    }

    var res = kbn.calculateInterval(this.range, this.resolution, intervalOverride);
    this.interval = res.interval;
    this.intervalMs = res.intervalMs;
  }

  applyPanelTimeOverrides() {
    this.timeInfo = '';

    // check panel time overrrides
    if (this.panel.timeFrom) {
      var timeFromInterpolated = this.templateSrv.replace(this.panel.timeFrom, this.panel.scopedVars);
      var timeFromInfo = rangeUtil.describeTextRange(timeFromInterpolated);
      if (timeFromInfo.invalid) {
        this.timeInfo = 'invalid time override';
        return;
      }

      if (_.isString(this.rangeRaw.from)) {
        var timeFromDate = dateMath.parse(timeFromInfo.from);
        this.timeInfo = timeFromInfo.display;
        this.rangeRaw.from = timeFromInfo.from;
        this.rangeRaw.to = timeFromInfo.to;
        this.range.from = timeFromDate;
        this.range.to = dateMath.parse(timeFromInfo.to);
      }
    }

    if (this.panel.timeShift) {
      var timeShiftInterpolated = this.templateSrv.replace(this.panel.timeShift, this.panel.scopedVars);
      var timeShiftInfo = rangeUtil.describeTextRange(timeShiftInterpolated);
      if (timeShiftInfo.invalid) {
        this.timeInfo = 'invalid timeshift';
        return;
      }

      var timeShift = '-' + timeShiftInterpolated;
      this.timeInfo += ' timeshift ' + timeShift;
      this.range.from = dateMath.parseDateMath(timeShift, this.range.from, false);
      this.range.to = dateMath.parseDateMath(timeShift, this.range.to, true);

      this.rangeRaw = this.range;
    }

    if (this.panel.hideTimeOverride) {
      this.timeInfo = '';
    }
  }

  updateTimeRange(datasource) {
    this.datasource = datasource || this.datasource;
    this.range = this.timeSrv.timeRange();
    this.rangeRaw = this.range.raw;

    this.applyPanelTimeOverrides();

    if (this.panel.maxDataPoints) {
      this.resolution = this.panel.maxDataPoints;
    } else {
      this.resolution = Math.ceil($(window).width() * (this.panel.span / 12));
    }

    this.calculateInterval();

    return this.datasource;
  }

  issueQueries(datasource) {
    return new Promise((resolve, reject) => {
      this.datasource = datasource;

      if (!this.panel.targets || this.panel.targets.length === 0) {
        return this.$q.when([]);
      }

      // make shallow copy of scoped vars,
      // and add built in variables interval and interval_ms
      var scopedVars = Object.assign({}, this.panel.scopedVars, {
        "__interval":     {text: this.interval,   value: this.interval},
        "__interval_ms":  {text: this.intervalMs, value: this.intervalMs},
      });

      var metricsQuery = {
        panelId: this.panel.id,
        range: this.range,
        rangeRaw: this.rangeRaw,
        interval: this.interval,
        intervalMs: this.intervalMs,
        targets: this.panel.targets,
        format: this.panel.renderer === 'png' ? 'png' : 'json',
        maxDataPoints: this.resolution,
        scopedVars: scopedVars,
        cacheTimeout: this.panel.cacheTimeout
      };

      const dayI = this.panel.dayInterval === 'NOW' ? moment().date() : this.panel.dayInterval;
      const hourI = this.panel.hourInterval === 'NOW' ? moment().hour() : this.panel.hourInterval;
      const minuteI = this.panel.minuteInterval === 'NOW' ? moment().minute() : this.panel.minuteInterval;

      const thisMonth = moment(metricsQuery.range.to).date(dayI).hour(hourI).minute(minuteI);
      const beginThisMonth = moment(thisMonth).startOf('month');
      const lastMonth = moment(thisMonth).subtract(1, 'month');
      const beginLastMonth = moment(lastMonth).startOf('month');

      const metricCop = Object.assign({}, metricsQuery);
      metricsQuery.rangeRaw.from = beginThisMonth;
      metricsQuery.rangeRaw.to = thisMonth;
      return datasource.query(metricsQuery)
      .then((res1) => {
        metricCop.rangeRaw.from = beginLastMonth;
        metricCop.rangeRaw.to = lastMonth;
        this.panel.title = `Delta ${beginLastMonth.format('DD-MM hh-mm-ss a')} / ${lastMonth.format('DD-MM hh-mm-ss a')} - ${beginThisMonth.format('DD-MM hh-mm-ss a')} / ${thisMonth.format('DD-MM hh-mm-ss a')}`;
        return datasource.query(metricCop)
        .then((res2) => resolve([res1, res2]))
        .catch((err) => reject(err));
      })
      .catch((err) => reject(err));
    });
  }

  handleQueryResult(results) {
    this.setTimeQueryEnd();
    this.loading = false;

    console.log(results);
    if (results[0].data.length <= 0 || results[1].data.length <= 0) {
      let error = new Error();
      error.message = 'Not enougth series error';
      error.data = '0 query entered';
      throw error;
    }

    if (typeof results[0].data[0] === 'undefined'){
      result = {data: []};
      console.log('No result.');
      return;
    }

    results[0].data[0].datapoints[0][0] -= results[1].data[0].datapoints[0][0]
    var result = results[0];

    // check for if data source returns subject
    if (result && result.subscribe) {
      this.handleDataStream(result);
      return;
    }

    if (this.dashboard.snapshot) {
      this.panel.snapshotData = result.data;
    }

    if (!result || !result.data) {
      console.log('Data source query result invalid, missing data field:', result);
      result = {data: []};
    }

    return this.events.emit('data-received', result.data);
  }

  onDataError(err) {
    this.onDataReceived([]);
  }

  onDataReceived(dataList) {
    const data = {};
    if (dataList.length > 0 && dataList[0].type === 'table'){
      this.dataType = 'table';
      const tableData = dataList.map(this.tableHandler.bind(this));
      this.setTableValues(tableData, data);
    } else {
      this.dataType = 'timeseries';
      this.series = dataList.map(this.seriesHandler.bind(this));
      this.setValues(data);
    }
    this.data = data;
    this.render();
  }

  seriesHandler(seriesData) {
    var series = new TimeSeries({
      datapoints: seriesData.datapoints,
      alias: seriesData.target,
    });

    series.flotpairs = series.getFlotPairs(this.panel.nullPointMode);
    return series;
  }

  tableHandler(tableData) {
    const datapoints = [];
    const columnNames = {};

    tableData.columns.forEach((column, columnIndex) => {
      columnNames[columnIndex] = column.text;
    });

    this.tableColumnOptions = columnNames;
    if (!_.find(tableData.columns, ['text', this.panel.tableColumn])) {
      this.setTableColumnToSensibleDefault(tableData);
    }

    tableData.rows.forEach((row) => {
      const datapoint = {};

      row.forEach((value, columnIndex) => {
        const key = columnNames[columnIndex];
        datapoint[key] = value;
      });

      datapoints.push(datapoint);
    });

    return datapoints;
  }

  setTableColumnToSensibleDefault(tableData) {
    if (this.tableColumnOptions.length === 1) {
      this.panel.tableColumn = this.tableColumnOptions[0];
    } else {
      this.panel.tableColumn = _.find(tableData.columns, (col) => { return col.type !== 'time'; }).text;
    }
  }

  setTableValues(tableData, data) {
    if (!tableData || tableData.length === 0) {
      return;
    }

    if (tableData[0].length === 0 || !tableData[0][0][this.panel.tableColumn]) {
      return;
    }

    let highestValue = 0;
    let lowestValue = Number.MAX_VALUE;
    const datapoint = tableData[0][0];
    data.value = datapoint[this.panel.tableColumn];

    if (_.isString(data.value)) {
      data.valueFormatted = _.escape(data.value);
      data.value = 0;
      data.valueRounded = 0;
    } else {
      const decimalInfo = this.getDecimalsForValue(data.value);
      const formatFunc = kbn.valueFormats[this.panel.format];
      data.valueFormatted = formatFunc(datapoint[this.panel.tableColumn], decimalInfo.decimals, decimalInfo.scaledDecimals);
      data.valueRounded = kbn.roundValue(data.value, this.panel.decimals || 0);
    }

    this.setValueMapping(data);
  }

  setColoring(options) {
    if (options.background) {
      this.panel.colorValue = false;
      this.panel.colors = ['rgba(71, 212, 59, 0.4)', 'rgba(245, 150, 40, 0.73)', 'rgba(225, 40, 40, 0.59)'];
    } else {
      this.panel.colorBackground = false;
      this.panel.colors = ['rgba(50, 172, 45, 0.97)', 'rgba(237, 129, 40, 0.89)', 'rgba(245, 54, 54, 0.9)'];
    }
    this.render();
  }

  invertColorOrder() {
    var tmp = this.panel.colors[0];
    this.panel.colors[0] = this.panel.colors[2];
    this.panel.colors[2] = tmp;
    this.render();
  }

  getDecimalsForValue(value) {
    if (_.isNumber(this.panel.decimals)) {
      return {decimals: this.panel.decimals, scaledDecimals: null};
    }

    var delta = value / 2;
    var dec = -Math.floor(Math.log(delta) / Math.LN10);

    var magn = Math.pow(10, -dec),
    norm = delta / magn, // norm is between 1.0 and 10.0
    size;

    if (norm < 1.5) {
      size = 1;
    } else if (norm < 3) {
      size = 2;
      // special case for 2.5, requires an extra decimal
      if (norm > 2.25) {
        size = 2.5;
        ++dec;
      }
    } else if (norm < 7.5) {
      size = 5;
    } else {
      size = 10;
    }

    size *= magn;

    // reduce starting decimals if not needed
    if (Math.floor(value) === value) { dec = 0; }

    var result = {};
    result.decimals = Math.max(0, dec);
    result.scaledDecimals = result.decimals - Math.floor(Math.log(size) / Math.LN10) + 2;

    return result;
  }

  setValues(data) {
    data.flotpairs = [];

    if (this.series.length > 1) {
      var error = new Error();
      error.message = 'Multiple Series Error';
      error.data = 'Metric query returns ' + this.series.length +
      ' series. Single Stat Panel expects a single series.\n\nResponse:\n'+JSON.stringify(this.series);
      throw error;
    }

    if (this.series && this.series.length > 0) {
      var lastPoint = _.last(this.series[0].datapoints);
      var lastValue = _.isArray(lastPoint) ? lastPoint[0] : null;

      if (this.panel.valueName === 'name') {
        data.value = 0;
        data.valueRounded = 0;
        data.valueFormatted = this.series[0].alias;
      } else if (_.isString(lastValue)) {
        data.value = 0;
        data.valueFormatted = _.escape(lastValue);
        data.valueRounded = 0;
      } else {
        data.value = this.series[0].stats[this.panel.valueName];
        data.flotpairs = this.series[0].flotpairs;

        var decimalInfo = this.getDecimalsForValue(data.value);
        var formatFunc = kbn.valueFormats[this.panel.format];
        data.valueFormatted = formatFunc(data.value, decimalInfo.decimals, decimalInfo.scaledDecimals);
        data.valueRounded = kbn.roundValue(data.value, decimalInfo.decimals);
      }

      // Add $__name variable for using in prefix or postfix
      data.scopedVars = _.extend({}, this.panel.scopedVars);
      data.scopedVars["__name"] = {value: this.series[0].label};
    }
    this.setValueMapping(data);
  }

  setValueMapping(data) {
    // check value to text mappings if its enabled
    if (this.panel.mappingType === 1) {
      for (let i = 0; i < this.panel.valueMaps.length; i++) {
        let map = this.panel.valueMaps[i];
        // special null case
        if (map.value === 'null') {
          if (data.value === null || data.value === void 0) {
            data.valueFormatted = map.text;
            return;
          }
          continue;
        }

        // value/number to text mapping
        var value = parseFloat(map.value);
        if (value === data.valueRounded) {
          data.valueFormatted = map.text;
          return;
        }
      }
    } else if (this.panel.mappingType === 2) {
      for (let i = 0; i < this.panel.rangeMaps.length; i++) {
        let map = this.panel.rangeMaps[i];
        // special null case
        if (map.from === 'null' && map.to === 'null') {
          if (data.value === null || data.value === void 0) {
            data.valueFormatted = map.text;
            return;
          }
          continue;
        }

        // value/number to range mapping
        var from = parseFloat(map.from);
        var to = parseFloat(map.to);
        if (to >= data.valueRounded && from <= data.valueRounded) {
          data.valueFormatted = map.text;
          return;
        }
      }
    }

    if (data.value === null || data.value === void 0) {
      data.valueFormatted = "no value";
    }
  }

  removeValueMap(map) {
    var index = _.indexOf(this.panel.valueMaps, map);
    this.panel.valueMaps.splice(index, 1);
    this.render();
  }

  addValueMap() {
    this.panel.valueMaps.push({value: '', op: '=', text: '' });
  }

  removeRangeMap(rangeMap) {
    var index = _.indexOf(this.panel.rangeMaps, rangeMap);
    this.panel.rangeMaps.splice(index, 1);
    this.render();
  }

  addRangeMap() {
    this.panel.rangeMaps.push({from: '', to: '', text: ''});
  }

  link(scope, elem, attrs, ctrl) {
    var $location = this.$location;
    var linkSrv = this.linkSrv;
    var $timeout = this.$timeout;
    var panel = ctrl.panel;
    var templateSrv = this.templateSrv;
    var data, linkInfo;
    var $panelContainer = elem.find('.panel-container');
    elem = elem.find('.singlestat-panel');

    function setElementHeight() {
      elem.css('height', ctrl.height + 'px');
    }

    function applyColoringThresholds(value, valueString) {
      if (!panel.colorValue) {
        return valueString;
      }

      var color = getColorForValue(data, value);
      if (color) {
        return '<span style="color:' + color + '">'+ valueString + '</span>';
      }

      return valueString;
    }

    function getSpan(className, fontSize, value)  {
      value = templateSrv.replace(value, data.scopedVars);
      return '<span class="' + className + '" style="font-size:' + fontSize + '">' +
      value + '</span>';
    }

    function getBigValueHtml() {
      var body = '<div class="singlestat-panel-value-container">';

      if (panel.prefix) { body += getSpan('singlestat-panel-prefix', panel.prefixFontSize, panel.prefix); }

      var value = applyColoringThresholds(data.value, data.valueFormatted);
      body += getSpan('singlestat-panel-value', panel.valueFontSize, value);

      if (panel.postfix) { body += getSpan('singlestat-panel-postfix', panel.postfixFontSize, panel.postfix); }

      body += '</div>';

      return body;
    }

    function getValueText() {
      var result = panel.prefix ? panel.prefix : '';
      result += data.valueFormatted;
      result += panel.postfix ? panel.postfix : '';

      return result;
    }

    function addGauge() {
      var width = elem.width();
      var height = elem.height();
      var dimension = Math.min(width, height);

      ctrl.invalidGaugeRange = false;
      if (panel.gauge.minValue > panel.gauge.maxValue) {
        ctrl.invalidGaugeRange = true;
        return;
      }

      var plotCanvas = $('<div></div>');
      var plotCss = {
        top: '10px',
        margin: 'auto',
        position: 'relative',
        height: (height * 0.9) + 'px',
        width:  dimension + 'px'
      };

      plotCanvas.css(plotCss);

      var thresholds = [];
      for (var i = 0; i < data.thresholds.length; i++) {
        thresholds.push({
          value: data.thresholds[i],
          color: data.colorMap[i]
        });
      }
      thresholds.push({
        value: panel.gauge.maxValue,
        color: data.colorMap[data.colorMap.length  - 1]
      });

      var bgColor = config.bootData.user.lightTheme
      ? 'rgb(230,230,230)'
      : 'rgb(38,38,38)';

      var fontScale = parseInt(panel.valueFontSize) / 100;
      var fontSize = Math.min(dimension/5, 100) * fontScale;
      var gaugeWidth = Math.min(dimension/6, 60);
      var thresholdMarkersWidth = gaugeWidth/5;

      var options = {
        series: {
          gauges: {
            gauge: {
              min: panel.gauge.minValue,
              max: panel.gauge.maxValue,
              background: { color: bgColor },
              border: { color: null },
              shadow: { show: false },
              width: gaugeWidth,
            },
            frame: { show: false },
            label: { show: false },
            layout: { margin: 0, thresholdWidth: 0 },
            cell: { border: { width: 0 } },
            threshold: {
              values: thresholds,
              label: {
                show: panel.gauge.thresholdLabels,
                margin: 8,
                font: { size: 18 }
              },
              show: panel.gauge.thresholdMarkers,
              width: thresholdMarkersWidth,
            },
            value: {
              color: panel.colorValue ? getColorForValue(data, data.valueRounded) : null,
              formatter: function() { return getValueText(); },
              font: { size: fontSize, family: '"Helvetica Neue", Helvetica, Arial, sans-serif' }
            },
            show: true
          }
        }
      };

      elem.append(plotCanvas);

      var plotSeries = {
        data: [[0, data.valueRounded]]
      };

      $.plot(plotCanvas, [plotSeries], options);
    }

    function addSparkline() {
      var width = elem.width() + 20;
      if (width < 30) {
        // element has not gotten it's width yet
        // delay sparkline render
        setTimeout(addSparkline, 30);
        return;
      }

      var height = ctrl.height;
      var plotCanvas = $('<div></div>');
      var plotCss = {};
      plotCss.position = 'absolute';

      if (panel.sparkline.full) {
        plotCss.bottom = '5px';
        plotCss.left = '-5px';
        plotCss.width = (width - 10) + 'px';
        var dynamicHeightMargin = height <= 100 ? 5 : (Math.round((height/100)) * 15) + 5;
        plotCss.height = (height - dynamicHeightMargin) + 'px';
      } else {
        plotCss.bottom = "0px";
        plotCss.left = "-5px";
        plotCss.width = (width - 10) + 'px';
        plotCss.height = Math.floor(height * 0.25) + "px";
      }

      plotCanvas.css(plotCss);

      var options = {
        legend: { show: false },
        series: {
          lines:  {
            show: true,
            fill: 1,
            lineWidth: 1,
            fillColor: panel.sparkline.fillColor,
          },
        },
        yaxes: { show: false },
        xaxis: {
          show: false,
          mode: "time",
          min: ctrl.range.from.valueOf(),
          max: ctrl.range.to.valueOf(),
        },
        grid: { hoverable: false, show: false },
      };

      elem.append(plotCanvas);

      var plotSeries = {
        data: data.flotpairs,
        color: panel.sparkline.lineColor
      };

      $.plot(plotCanvas, [plotSeries], options);
    }

    function render() {
      if (!ctrl.data) { return; }
      data = ctrl.data;

      // get thresholds
      data.thresholds = panel.thresholds.split(',').map(function(strVale) {
        return Number(strVale.trim());
      });
      data.colorMap = panel.colors;

      setElementHeight();

      var body = panel.gauge.show ? '' : getBigValueHtml();

      if (panel.colorBackground && !isNaN(data.value)) {
        var color = getColorForValue(data, data.value);
        if (color) {
          $panelContainer.css('background-color', color);
          if (scope.fullscreen) {
            elem.css('background-color', color);
          } else {
            elem.css('background-color', '');
          }
        }
      } else {
        $panelContainer.css('background-color', '');
        elem.css('background-color', '');
      }

      elem.html(body);

      if (panel.sparkline.show) {
        addSparkline();
      }

      if (panel.gauge.show) {
        addGauge();
      }

      elem.toggleClass('pointer', panel.links.length > 0);

      if (panel.links.length > 0) {
        linkInfo = linkSrv.getPanelLinkAnchorInfo(panel.links[0], data.scopedVars);
      } else {
        linkInfo = null;
      }
    }

    function hookupDrilldownLinkTooltip() {
      // drilldown link tooltip
      var drilldownTooltip = $('<div id="tooltip" class="">hello</div>"');

      elem.mouseleave(function() {
        if (panel.links.length === 0) { return;}
        $timeout(function() {
          drilldownTooltip.detach();
        });
      });

      elem.click(function(evt) {
        if (!linkInfo) { return; }
        // ignore title clicks in title
        if ($(evt).parents('.panel-header').length > 0) { return; }

        if (linkInfo.target === '_blank') {
          var redirectWindow = window.open(linkInfo.href, '_blank');
          redirectWindow.location;
          return;
        }

        if (linkInfo.href.indexOf('http') === 0) {
          window.location.href = linkInfo.href;
        } else {
          $timeout(function() {
            $location.url(linkInfo.href);
          });
        }

        drilldownTooltip.detach();
      });

      elem.mousemove(function(e) {
        if (!linkInfo) { return;}

        drilldownTooltip.text('click to go to: ' + linkInfo.title);
        drilldownTooltip.place_tt(e.pageX, e.pageY-50);
      });
    }

    hookupDrilldownLinkTooltip();

    this.events.on('render', function() {
      render();
      ctrl.renderingCompleted();
    });
  }
  getDecimalsForValue(value) {
    if (_.isNumber(this.panel.decimals)) {
      return {decimals: this.panel.decimals, scaledDecimals: null};
    }

    var delta = value / 2;
    var dec = -Math.floor(Math.log(delta) / Math.LN10);

    var magn = Math.pow(10, -dec),
    norm = delta / magn, // norm is between 1.0 and 10.0
    size;

    if (norm < 1.5) {
      size = 1;
    } else if (norm < 3) {
      size = 2;
      // special case for 2.5, requires an extra decimal
      if (norm > 2.25) {
        size = 2.5;
        ++dec;
      }
    } else if (norm < 7.5) {
      size = 5;
    } else {
      size = 10;
    }

    size *= magn;

    // reduce starting decimals if not needed
    if (Math.floor(value) === value) { dec = 0; }

    var result = {};
    result.decimals = Math.max(0, dec);
    result.scaledDecimals = result.decimals - Math.floor(Math.log(size) / Math.LN10) + 2;

    return result;
  }
}

function getColorForValue(data, value) {
  for (var i = data.thresholds.length; i > 0; i--) {
    if (value >= data.thresholds[i-1]) {
      return data.colorMap[i];
    }
  }
  return _.first(data.colorMap);
}

DeltaPluginCtrl.templateUrl = 'module.html';
