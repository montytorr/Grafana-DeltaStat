import {SingleStatCtrl} from 'app/plugins/panel/singlestat/module';

import moment from 'moment';
import _ from 'lodash';
import $ from 'jquery';
import 'jquery.flot';
import 'jquery.flot.gauge';
import kbn from 'app/core/utils/kbn';
import TimeSeries from 'app/core/time_series2';

export class DeltaPluginCtrl extends SingleStatCtrl {

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
      dayInterval: 'NOW',
    };

    _.defaults(this.panel, panelDefaults);
    this.scope = $scope;

  }

  onInitEditMode() {
    super.onInitEditMode();
    this.fontSizes = ['20%', '30%','50%','70%','80%','100%', '110%', '120%', '150%', '170%', '200%'];
    this.addEditorTab('Delta Config', 'public/plugins/grafana-delta-panel/editor.html', 5);
    //this.addEditorTab('Options', 'public/app/plugins/panel/singlestat/editor.html', 3)
    //this.addEditorTab('Value Mappings', 'public/app/plugins/panel/singlestat/mappings.html', 4);
    this.unitFormats = kbn.getUnitFormats();
  }

  setUnitFormat(subItem) {
    super.setUnitFormat();
    this.panel.format = subItem.value;
    this.render();
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

      let thisMonth = null;

      if (moment().unix() < metricsQuery.range.to.unix()) {
        thisMonth = moment().date(dayI);
      } else {
        thisMonth = moment(metricsQuery.range.to).date(dayI);
      }

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
}

DeltaPluginCtrl.templateUrl = 'module.html';
