import React, { useState, useRef, useEffect } from 'react';
import { ShieldAlert, Zap, Globe, Flame, CloudSun, CalendarClock, Info } from 'lucide-react';
import { GRID_ZONES } from '../services/electricityMaps';
import type { CarbonResponse } from '../services/electricityMaps';
import { calculateWindowScore } from '../utils/algorithms';
import type { GreenWindow } from '../utils/algorithms';

interface DashboardProps {
  carbonData: CarbonResponse;
  greenWindows: GreenWindow[];
  lowCarbonThreshold: number;
}

export const Dashboard: React.FC<DashboardProps> = ({
  carbonData,
  greenWindows,
  lowCarbonThreshold,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    intensity: number;
    time: string;
    isHistory: boolean;
  } | null>(null);

  const chartRef = useRef<SVGSVGElement>(null);
  
  const zoneInfo = GRID_ZONES.find(z => z.id === carbonData.zone) || GRID_ZONES[0];
  const currentIntensity = carbonData.current.carbonIntensity;

  // Classify current carbon level
  let carbonStatus: 'low' | 'moderate' | 'high' = 'moderate';
  let carbonColor = 'var(--amber)';
  let carbonLabel = 'Moderate Carbon';
  let carbonDesc = 'Grid has medium carbon intensity. Postpone flexible activities if possible.';

  if (currentIntensity < lowCarbonThreshold) {
    carbonStatus = 'low';
    carbonColor = 'var(--green)';
    carbonLabel = 'Optimal (Green)';
    carbonDesc = 'Grid carbon intensity is low. Ideal window for running flexible digital activities!';
  } else if (currentIntensity > lowCarbonThreshold * 1.8) {
    carbonStatus = 'high';
    carbonColor = 'var(--rose)';
    carbonLabel = 'High Carbon Intensity';
    carbonDesc = 'Grid relies heavily on fossil fuels. Automatically pausing or delaying heavy jobs.';
  }

  // Circular gauge config
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  // Maximum intensity for gauge calculation (e.g. 800 g/kWh)
  const maxGaugeIntensity = 800;
  const strokeDashoffset = circumference - (Math.min(currentIntensity, maxGaugeIntensity) / maxGaugeIntensity) * circumference;

  // Chart calculation data
  const historyData = carbonData.history;
  const forecastData = carbonData.forecast;
  const allPoints = [...historyData, carbonData.current, ...forecastData];
  const totalPointsCount = allPoints.length;

  const chartHeight = 240;
  const [chartWidth, setChartWidth] = useState(600);

  // Handle chart resizing
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current) {
        setChartWidth(chartRef.current.clientWidth);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Find min/max values for charting scale
  const intensities = allPoints.map(p => p.carbonIntensity);
  const minIntensity = Math.max(0, Math.min(...intensities) - 20);
  const maxIntensity = Math.max(minIntensity + 100, Math.max(...intensities) + 25);
  const intensityRange = maxIntensity - minIntensity;

  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const drawableWidth = chartWidth - paddingLeft - paddingRight;
  const drawableHeight = chartHeight - paddingTop - paddingBottom;

  // Map data point to SVG coordinates
  const getCoordinates = (index: number, intensity: number) => {
    const x = paddingLeft + (index / (totalPointsCount - 1)) * drawableWidth;
    const y = paddingTop + drawableHeight - ((intensity - minIntensity) / intensityRange) * drawableHeight;
    return { x, y };
  };

  // Build the svg points path
  const linePoints = allPoints.map((p, idx) => getCoordinates(idx, p.carbonIntensity));
  const linePath = linePoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = linePoints.length > 0 
    ? `${linePath} L ${linePoints[linePoints.length - 1].x} ${paddingTop + drawableHeight} L ${linePoints[0].x} ${paddingTop + drawableHeight} Z`
    : '';

  // Current time marker X coordinate (index is historyData.length)
  const nowIndex = historyData.length;
  const nowX = getCoordinates(nowIndex, currentIntensity).x;

  // Render Green Windows shading on chart
  const renderChartGreenWindows = () => {
    return greenWindows.map(w => {
      // Find starting date and duration in hours offset
      const nowTime = new Date(carbonData.current.datetime).getTime();
      const winStartTime = new Date(w.startTime).getTime();
      const offsetMs = winStartTime - nowTime;
      const offsetHours = offsetMs / (1000 * 60 * 60);

      // Duration in hours
      const durationHours = w.duration / 60;

      // Map offsetHours and durationHours to indices relative to forecast
      const startIndex = nowIndex + offsetHours;
      const endIndex = startIndex + durationHours;

      const startX = paddingLeft + (Math.max(0, startIndex) / (totalPointsCount - 1)) * drawableWidth;
      const endX = paddingLeft + (Math.min(totalPointsCount - 1, endIndex) / (totalPointsCount - 1)) * drawableWidth;

      if (startX >= chartWidth - paddingRight || endX <= paddingLeft) return null;

      return (
        <g key={w.id}>
          <rect
            x={startX}
            y={paddingTop}
            width={Math.max(2, endX - startX)}
            height={drawableHeight}
            className="chart-window-shading"
          />
          <line
            x1={startX}
            y1={paddingTop}
            x2={startX}
            y2={paddingTop + drawableHeight}
            className="chart-window-border"
          />
          <line
            x1={endX}
            y1={paddingTop}
            x2={endX}
            y2={paddingTop + drawableHeight}
            className="chart-window-border"
          />
        </g>
      );
    });
  };

  // Handle mouse moves on chart to show tooltip
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Find nearest point
    let nearestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < totalPointsCount; i++) {
      const { x } = getCoordinates(i, allPoints[i].carbonIntensity);
      const distance = Math.abs(x - mouseX);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIdx = i;
      }
    }

    const targetPoint = allPoints[nearestIdx];
    const { x, y } = getCoordinates(nearestIdx, targetPoint.carbonIntensity);
    const date = new Date(targetPoint.datetime);
    
    setHoveredPoint({
      x,
      y,
      intensity: targetPoint.carbonIntensity,
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isHistory: nearestIdx < nowIndex,
    });
  };

  // Find max duration of windows for scoring
  const maxWinDuration = Math.max(...greenWindows.map(w => w.duration), 1);

  return (
    <div className="dashboard-grid">
      {/* Real-time Status Card */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={22} style={{ color: 'var(--green)' }} />
            Real-Time Carbon Monitoring
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Current grid intensity and composition status
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', alignItems: 'center', justifyContent: 'space-around', margin: '10px 0' }}>
          {/* Circular Gauge */}
          <div className="gauge-container">
            <svg className="gauge-svg">
              <circle cx="100" cy="100" r={radius} className="gauge-bg" />
              <circle
                cx="100"
                cy="100"
                r={radius}
                className="gauge-fill"
                stroke={carbonColor}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{ filter: `drop-shadow(0 0 8px ${carbonColor}80)` }}
              />
            </svg>
            <div className="gauge-content">
              <span className="gauge-number">{currentIntensity}</span>
              <span className="gauge-unit">gCO₂e/kWh</span>
            </div>
          </div>

          {/* Details */}
          <div style={{ flex: '1', minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <span className="zone-badge">
                <Zap size={14} style={{ color: 'var(--green)' }} />
                {zoneInfo.name} ({zoneInfo.id})
              </span>
            </div>
            
            <div style={{ fontSize: '18px', fontWeight: '700', color: carbonColor, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {carbonStatus === 'low' && <CloudSun size={20} />}
              {carbonStatus === 'moderate' && <Zap size={20} />}
              {carbonStatus === 'high' && <Flame size={20} />}
              {carbonLabel}
            </div>

            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {carbonDesc}
            </p>

            <div style={{ display: 'flex', gap: '10px', fontSize: '12px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <Info size={16} style={{ color: 'var(--blue)', flexShrink: 0 }} />
              <div>
                <strong>Grid Generation Type:</strong> {zoneInfo.type.toUpperCase()}-heavy grid. Base intensity is ~{zoneInfo.baseIntensity} g/kWh.
              </div>
            </div>
          </div>
        </div>

        {/* Forecast Chart Container */}
        <div style={{ marginTop: '10px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CalendarClock size={16} style={{ color: 'var(--blue)' }} />
            Grid Carbon Forecast (36-Hour Window)
          </h3>
          
          <div className="chart-container" style={{ cursor: 'crosshair' }}>
            <svg
              ref={chartRef}
              className="chart-svg"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              <defs>
                <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={carbonColor} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={carbonColor} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Shaded Green Windows */}
              {renderChartGreenWindows()}

              {/* Grid Lines */}
              <line x1={paddingLeft} y1={paddingTop} x2={chartWidth - paddingRight} y2={paddingTop} className="chart-grid-line" />
              <line x1={paddingLeft} y1={paddingTop + drawableHeight / 2} x2={chartWidth - paddingRight} y2={paddingTop + drawableHeight / 2} className="chart-grid-line" />
              <line x1={paddingLeft} y1={paddingTop + drawableHeight} x2={chartWidth - paddingRight} y2={paddingTop + drawableHeight} className="chart-grid-line" />

              {/* NOW Vertical Line */}
              <line
                x1={nowX}
                y1={paddingTop}
                x2={nowX}
                y2={paddingTop + drawableHeight}
                stroke="var(--text-muted)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <text x={nowX + 5} y={paddingTop + 15} fill="var(--text-secondary)" fontSize="9" fontWeight="600">
                NOW
              </text>

              {/* Threshold line */}
              {(() => {
                const thresholdY = paddingTop + drawableHeight - ((lowCarbonThreshold - minIntensity) / intensityRange) * drawableHeight;
                if (thresholdY >= paddingTop && thresholdY <= paddingTop + drawableHeight) {
                  return (
                    <g>
                      <line
                        x1={paddingLeft}
                        y1={thresholdY}
                        x2={chartWidth - paddingRight}
                        y2={thresholdY}
                        stroke="var(--green-border)"
                        strokeWidth="1"
                        strokeDasharray="4 6"
                      />
                      <text x={chartWidth - paddingRight - 80} y={thresholdY - 4} fill="var(--green)" fontSize="8" fontWeight="bold">
                        GREEN THRESHOLD
                      </text>
                    </g>
                  );
                }
                return null;
              })()}

              {/* Chart Line Path */}
              <path d={areaPath} fill="url(#chart-gradient)" />
              <path d={linePath} className="chart-line" stroke="var(--blue)" style={{ filter: 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.4))' }} />

              {/* Historical vs Forecast dots divider */}
              {allPoints.map((p, idx) => {
                const { x, y } = getCoordinates(idx, p.carbonIntensity);
                // Draw dots every 3 hours to avoid clutter
                if (idx % 3 === 0 && idx !== nowIndex) {
                  return (
                    <circle
                      key={idx}
                      cx={x}
                      cy={y}
                      r="4"
                      className="chart-point"
                      stroke={idx < nowIndex ? 'rgba(148, 163, 184, 0.5)' : 'var(--blue)'}
                    />
                  );
                }
                return null;
              })}

              {/* Interactive Hover Point */}
              {hoveredPoint && (
                <g>
                  <circle
                    cx={hoveredPoint.x}
                    cy={hoveredPoint.y}
                    r="6"
                    fill={hoveredPoint.intensity < lowCarbonThreshold ? 'var(--green)' : 'var(--amber)'}
                    stroke="var(--text-primary)"
                    strokeWidth="2"
                  />
                  <line
                    x1={hoveredPoint.x}
                    y1={paddingTop}
                    x2={hoveredPoint.x}
                    y2={paddingTop + drawableHeight}
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="1"
                  />
                </g>
              )}

              {/* X Axis labels */}
              <text x={paddingLeft} y={chartHeight - 8} className="chart-x-labels" textAnchor="start">
                -12h ago
              </text>
              <text x={nowX} y={chartHeight - 8} className="chart-x-labels" textAnchor="middle">
                Now ({new Date(carbonData.current.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
              </text>
              <text x={chartWidth - paddingRight} y={chartHeight - 8} className="chart-x-labels" textAnchor="end">
                +24h forecast
              </text>

              {/* Y Axis labels */}
              <text x={paddingLeft - 8} y={paddingTop + 4} className="chart-y-labels" textAnchor="end">
                {maxIntensity}
              </text>
              <text x={paddingLeft - 8} y={paddingTop + drawableHeight / 2 + 4} className="chart-y-labels" textAnchor="end">
                {Math.round(minIntensity + intensityRange / 2)}
              </text>
              <text x={paddingLeft - 8} y={paddingTop + drawableHeight + 4} className="chart-y-labels" textAnchor="end">
                {minIntensity}
              </text>
            </svg>

            {/* Custom Tooltip */}
            {hoveredPoint && (
              <div
                className="chart-tooltip"
                style={{
                  left: `${hoveredPoint.x - 50}px`,
                  top: `${hoveredPoint.y - 75}px`,
                }}
              >
                <div style={{ color: 'var(--text-muted)', fontWeight: 'bold' }}>
                  {hoveredPoint.isHistory ? 'Historical' : 'Forecast'} ({hoveredPoint.time})
                </div>
                <div style={{ fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={12} style={{ color: 'var(--green)' }} />
                  {hoveredPoint.intensity} gCO₂e/kWh
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Green Time Windows Panel */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarClock size={20} style={{ color: 'var(--green)' }} />
            Green Windows Detection
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Ranked low-carbon time periods in the next 24 hours
          </p>
        </div>

        {greenWindows.length === 0 ? (
          <div style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '30px 10px', textAlign: 'center' }}>
            <ShieldAlert size={36} style={{ color: 'var(--rose)' }} />
            <div>
              <h4 style={{ fontSize: '14px', fontWeight: '600' }}>No Green Windows Detected</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Grid carbon intensity is expected to remain above the threshold ({lowCarbonThreshold} g/kWh).
              </p>
            </div>
          </div>
        ) : (
          <div className="green-windows-list" style={{ overflowY: 'auto', flex: '1' }}>
            {greenWindows.map((win, idx) => {
              const score = calculateWindowScore(win.carbonSavingPercent, win.userConvenience, win.duration, maxWinDuration);
              const nowTime = new Date(carbonData.current.datetime).getTime();
              const winStartTime = new Date(win.startTime).getTime();
              
              let timingLabel = '';
              if (winStartTime <= nowTime) {
                timingLabel = 'Active Now';
              } else {
                const diffMs = winStartTime - nowTime;
                const diffMins = Math.round(diffMs / (1000 * 60));
                if (diffMins < 60) {
                  timingLabel = `In ${diffMins} min`;
                } else {
                  timingLabel = `In ${Math.round(diffMins / 60)}h`;
                }
              }

              const winDate = new Date(win.startTime);
              const timeFormatted = winDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

              return (
                <div key={win.id} className={`window-item ${winStartTime <= nowTime ? 'active' : ''}`}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="window-time">{timeFormatted}</span>
                      <span style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: winStartTime <= nowTime ? 'var(--green-glow)' : 'var(--bg-tertiary)',
                        color: winStartTime <= nowTime ? 'var(--green)' : 'var(--text-secondary)',
                        fontWeight: 'bold',
                        border: winStartTime <= nowTime ? '1px solid var(--green-border)' : '1px solid var(--border-glass)'
                      }}>
                        {timingLabel}
                      </span>
                    </div>
                    <div className="window-duration">
                      Duration: {win.duration} mins | Convenience: {win.userConvenience}%
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span className="window-savings-tag">
                      {win.carbonSavingPercent.toFixed(0)}% Savings
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--purple)', fontWeight: 'bold' }}>
                      Rank #{idx + 1} (Score: {score})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
