'use strict';

System.register(['app/plugins/panel/singlestat/module', 'moment', 'lodash', 'jquery', 'jquery.flot', 'jquery.flot.gauge', 'app/core/utils/kbn', 'app/core/time_series2'], function (_export, _context) {
  "use strict";

  var SingleStatCtrl, moment, _, $, kbn, TimeSeries, _createClass, _get, DeltaPluginCtrl;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  function _possibleConstructorReturn(self, call) {
    if (!self) {
      throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }

    return call && (typeof call === "object" || typeof call === "function") ? call : self;
  }

  function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
    }

    subClass.prototype = Object.create(superClass && superClass.prototype, {
      constructor: {
        value: subClass,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
    if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
  }

  return {
    setters: [function (_appPluginsPanelSinglestatModule) {
      SingleStatCtrl = _appPluginsPanelSinglestatModule.SingleStatCtrl;
    }, function (_moment) {
      moment = _moment.default;
    }, function (_lodash) {
      _ = _lodash.default;
    }, function (_jquery) {
      $ = _jquery.default;
    }, function (_jqueryFlot) {}, function (_jqueryFlotGauge) {}, function (_appCoreUtilsKbn) {
      kbn = _appCoreUtilsKbn.default;
    }, function (_appCoreTime_series) {
      TimeSeries = _appCoreTime_series.default;
    }],
    execute: function () {
      _createClass = function () {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }

        return function (Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      }();

      _get = function get(object, property, receiver) {
        if (object === null) object = Function.prototype;
        var desc = Object.getOwnPropertyDescriptor(object, property);

        if (desc === undefined) {
          var parent = Object.getPrototypeOf(object);

          if (parent === null) {
            return undefined;
          } else {
            return get(parent, property, receiver);
          }
        } else if ("value" in desc) {
          return desc.value;
        } else {
          var getter = desc.get;

          if (getter === undefined) {
            return undefined;
          }

          return getter.call(receiver);
        }
      };

      _export('DeltaPluginCtrl', DeltaPluginCtrl = function (_SingleStatCtrl) {
        _inherits(DeltaPluginCtrl, _SingleStatCtrl);

        function DeltaPluginCtrl($scope, $injector, $rootScope) {
          _classCallCheck(this, DeltaPluginCtrl);

          var _this = _possibleConstructorReturn(this, (DeltaPluginCtrl.__proto__ || Object.getPrototypeOf(DeltaPluginCtrl)).call(this, $scope, $injector));

          _this.$rootScope = $rootScope;
          console.log('Initializing plugin');

          var panelDefaults = {
            links: [],
            datasource: null,
            maxDataPoints: 100,
            interval: null,
            targets: [{}],
            cacheTimeout: null,
            dayInterval: 'NOW',
            hourInterval: 'NOW',
            minuteInterval: 'NOW'
          };

          _.defaultsDeep(_this.panel, panelDefaults);
          _this.scope = $scope;

          _this.events.on('init-edit-mode', _this.onInitEditMode.bind(_this));
          // this.events.on('panel-teardown', this.onPanelTeardown.bind(this));
          _this.events.on('panel-initialized', _this.render.bind(_this));

          return _this;
        }

        _createClass(DeltaPluginCtrl, [{
          key: 'onInitEditMode',
          value: function onInitEditMode() {
            _get(DeltaPluginCtrl.prototype.__proto__ || Object.getPrototypeOf(DeltaPluginCtrl.prototype), 'onInitEditMode', this).call(this);
            this.addEditorTab('Delta Config', 'public/plugins/grafana-delta-panel/delta_config.html', 2);
            this.unitFormats = kbn.getUnitFormats();
          }
        }, {
          key: 'setUnitFormat',
          value: function setUnitFormat(subItem) {
            _get(DeltaPluginCtrl.prototype.__proto__ || Object.getPrototypeOf(DeltaPluginCtrl.prototype), 'setUnitFormat', this).call(this);
            this.panel.format = subItem.value;
            this.render();
          }
        }, {
          key: 'issueQueries',
          value: function issueQueries(datasource) {
            var _this2 = this;

            return new Promise(function (resolve, reject) {
              _this2.datasource = datasource;

              if (!_this2.panel.targets || _this2.panel.targets.length === 0) {
                return _this2.$q.when([]);
              }

              // make shallow copy of scoped vars,
              // and add built in variables interval and interval_ms
              var scopedVars = Object.assign({}, _this2.panel.scopedVars, {
                "__interval": { text: _this2.interval, value: _this2.interval },
                "__interval_ms": { text: _this2.intervalMs, value: _this2.intervalMs }
              });

              var metricsQuery = {
                panelId: _this2.panel.id,
                range: _this2.range,
                rangeRaw: _this2.rangeRaw,
                interval: _this2.interval,
                intervalMs: _this2.intervalMs,
                targets: _this2.panel.targets,
                format: _this2.panel.renderer === 'png' ? 'png' : 'json',
                maxDataPoints: _this2.resolution,
                scopedVars: scopedVars,
                cacheTimeout: _this2.panel.cacheTimeout
              };

              var dayI = _this2.panel.dayInterval === 'NOW' ? moment().date() : _this2.panel.dayInterval;
              var hourI = _this2.panel.hourInterval === 'NOW' ? moment().hour() : _this2.panel.hourInterval;
              var minuteI = _this2.panel.minuteInterval === 'NOW' ? moment().minute() : _this2.panel.minuteInterval;

              var thisMonth = moment(metricsQuery.range.to).date(dayI).hour(hourI).minute(minuteI);
              var beginThisMonth = moment(thisMonth).startOf('month');
              var lastMonth = moment(thisMonth).subtract(1, 'month');
              var beginLastMonth = moment(lastMonth).startOf('month');

              var metricCop = Object.assign({}, metricsQuery);
              metricsQuery.rangeRaw.from = beginThisMonth;
              metricsQuery.rangeRaw.to = thisMonth;
              return datasource.query(metricsQuery).then(function (res1) {
                metricCop.rangeRaw.from = beginLastMonth;
                metricCop.rangeRaw.to = lastMonth;
                _this2.panel.title = 'Delta ' + beginLastMonth.format('DD-MM hh-mm-ss a') + ' / ' + lastMonth.format('DD-MM hh-mm-ss a') + ' - ' + beginThisMonth.format('DD-MM hh-mm-ss a') + ' / ' + thisMonth.format('DD-MM hh-mm-ss a');
                return datasource.query(metricCop).then(function (res2) {
                  return resolve([res1, res2]);
                }).catch(function (err) {
                  return reject(err);
                });
              }).catch(function (err) {
                return reject(err);
              });
            });
          }
        }, {
          key: 'handleQueryResult',
          value: function handleQueryResult(results) {
            this.setTimeQueryEnd();
            this.loading = false;

            // if (results[0].data.length <= 0 || results[1].data.length <= 0) {
            //   let error = new Error();
            //   error.message = 'Not enougth series error';
            //   error.data = '0 query entered';
            //   throw error;
            // }

            if (typeof results[0].data[0] === 'undefined') {
              result = { data: [] };
              console.log('No result.');
              return;
            }

            results[0].data[0].datapoints[0][0] -= results[1].data[0].datapoints[0][0];
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
              result = { data: [] };
            }

            return this.events.emit('data-received', result.data);
          }
        }, {
          key: 'link',
          value: function link(scope, elem) {
            this.events.on('render', function () {
              console.log('rendering panel');
            });
          }
        }]);

        return DeltaPluginCtrl;
      }(SingleStatCtrl));

      _export('DeltaPluginCtrl', DeltaPluginCtrl);

      DeltaPluginCtrl.templateUrl = 'module.html';
    }
  };
});
//# sourceMappingURL=delta_ctrl.js.map
