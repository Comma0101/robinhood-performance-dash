'use client';

import { useState, useEffect } from 'react';
import {
  getMorningReport,
  generateReport,
  type PreMarketReport as MorningReport,
} from '@/lib/api/reports';

interface MorningReportCardProps {
  date?: string;
}

export default function MorningReportCard({ date }: MorningReportCardProps) {
  const [report, setReport] = useState<MorningReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const reportDate = date || new Date().toISOString().split('T')[0];

  useEffect(() => {
    loadReport();
  }, [reportDate]);

  const loadReport = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMorningReport(reportDate);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    try {
      setGenerating(true);
      setError(null);
      await generateReport('QQQ', reportDate);
      await loadReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={handleGenerateReport}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg"
          >
            {generating ? 'Generating...' : 'Generate Morning Report'}
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const biasColor = {
    Bullish: 'text-green-400',
    Bearish: 'text-red-400',
    Neutral: 'text-gray-400',
  }[report.htf_bias];

  const dayTypeColor = {
    trend: 'bg-green-600',
    reversal: 'bg-yellow-600',
    consolidation: 'bg-gray-600',
    unknown: 'bg-gray-600',
  }[report.day_type || 'unknown'];

  return (
    <div className="bg-gray-800 rounded-lg p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Morning Report - {report.symbol}</h2>
          <p className="text-sm text-gray-400">{report.date}</p>
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold ${biasColor}`}>
            {report.htf_bias.toUpperCase()}
          </div>
          <div className="text-sm text-gray-400">
            Confidence: {(report.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Day Type */}
      {report.day_type && (
        <div>
          <span className={`px-3 py-1 rounded-lg text-sm font-medium ${dayTypeColor}`}>
            {report.day_type.toUpperCase()} DAY
          </span>
          {report.day_type_reasoning && (
            <p className="text-sm text-gray-400 mt-2">{report.day_type_reasoning}</p>
          )}
        </div>
      )}

      {/* Narrative */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="font-medium mb-2">Market Narrative</h3>
        <p className="text-gray-300 whitespace-pre-wrap">{report.narrative}</p>
      </div>

      {/* Session Structure */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="font-medium mb-2 text-blue-400">Asian Session</h3>
          <div className="text-sm space-y-1">
            {report.asian_session_high && (
              <div>High: {report.asian_session_high.toFixed(2)}</div>
            )}
            {report.asian_session_low && (
              <div>Low: {report.asian_session_low.toFixed(2)}</div>
            )}
            {!report.asian_complete && report.asian_bars_count != null && report.asian_bars_count > 0 && (
              <div className="text-gray-400">
                Partial: {report.asian_bars_count} bars as of{' '}
                {report.sessions_last_ts ? new Date(report.sessions_last_ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
            )}
            {(!report.asian_session_high || !report.asian_session_low) && (!report.asian_bars_count || report.asian_bars_count === 0) && (
              <div className="text-gray-500">No data</div>
            )}
          </div>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="font-medium mb-2 text-orange-400">London Session</h3>
          <div className="text-sm space-y-1">
            {report.london_session_high && (
              <div>High: {report.london_session_high.toFixed(2)}</div>
            )}
            {report.london_session_low && (
              <div>Low: {report.london_session_low.toFixed(2)}</div>
            )}
            {!report.london_complete && report.london_bars_count != null && report.london_bars_count > 0 && (
              <div className="text-gray-400">
                Partial: {report.london_bars_count} bars as of{' '}
                {report.sessions_last_ts ? new Date(report.sessions_last_ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
            )}
            {(!report.london_session_high || !report.london_session_low) && (!report.london_bars_count || report.london_bars_count === 0) && (
              <div className="text-gray-500">No data</div>
            )}
          </div>
        </div>
      </div>

      {/* Session Diagnostics */}
      {(report.asian_bars_count != null || report.london_bars_count != null) && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="font-medium mb-2">Session Diagnostics</h3>
          <div className="space-y-1 text-sm text-gray-300">
            {report.asian_bars_count != null && (
              <div>
                Asian bars: {report.asian_bars_count}{' '}
                <span className="text-gray-400">
                  ({report.asian_complete ? 'complete' : 'partial'})
                </span>
              </div>
            )}
            {report.london_bars_count != null && (
              <div>
                London bars: {report.london_bars_count}{' '}
                <span className="text-gray-400">
                  ({report.london_complete ? 'complete' : 'partial'})
                </span>
              </div>
            )}
            {report.sessions_last_ts && (
              <div>
                Last data timestamp:{' '}
                {new Date(report.sessions_last_ts).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            )}
            <div>
              London extremes:{' '}
              {report.london_made_high
                ? 'London holds current high of day'
                : report.london_made_low
                  ? 'London holds current low of day'
                  : 'Not set yet'}
            </div>
          </div>
        </div>
      )}

      {/* Dealing Range */}
      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="font-medium mb-2">Dealing Range</h3>
        <div className="space-y-1 text-sm">
          {report.dealing_range_source && (
            <div className="flex justify-between text-gray-400">
              <span>Source:</span>
              <span>
                {report.dealing_range_source === 'prev_day'
                  ? 'Previous Day H/L'
                  : report.dealing_range_source === 'htf'
                    ? 'HTF Dealing Range'
                    : report.dealing_range_source === 'recent_1D'
                      ? 'Recent 1D Range'
                      : report.dealing_range_source}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-400">High:</span>
            <span>{report.htf_dealing_range_high?.toFixed(2)}</span>
          </div>
          {report.premium_zone && (
            <div className="flex justify-between text-yellow-400">
              <span>Premium (61.8%):</span>
              <span>{report.premium_zone.toFixed(2)}</span>
            </div>
          )}
          {report.equilibrium && (
            <div className="flex justify-between text-gray-300">
              <span>EQ (50%):</span>
              <span>{report.equilibrium.toFixed(2)}</span>
            </div>
          )}
          {report.discount_zone && (
            <div className="flex justify-between text-blue-400">
              <span>Discount (38.2%):</span>
              <span>{report.discount_zone.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-400">Low:</span>
            <span>{report.htf_dealing_range_low?.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Trade Scenarios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Long Scenario */}
        {report.long_scenario && (
          <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
            <h3 className="font-medium mb-3 text-green-400">Long A+ Scenario</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-400">Entry Zone:</span>{' '}
                {report.long_scenario.entry_zone.low.toFixed(2)} -{' '}
                {report.long_scenario.entry_zone.high.toFixed(2)}
              </div>
              <div>
                <span className="text-gray-400">Stop:</span>{' '}
                {report.long_scenario.stop_loss.toFixed(2)}
              </div>
              <div>
                <span className="text-gray-400">Targets:</span>{' '}
                {report.long_scenario.targets.map((t) => t.toFixed(2)).join(', ')}
              </div>
              <div>
                <span className="text-gray-400">R:R:</span>{' '}
                {report.long_scenario.risk_reward.toFixed(1)}
              </div>
              <div className="pt-2 border-t border-green-700/50">
                <div className="text-gray-400 mb-1">Conditions:</div>
                <ul className="list-disc list-inside text-xs space-y-1">
                  {report.long_scenario.entry_conditions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Short Scenario */}
        {report.short_scenario && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
            <h3 className="font-medium mb-3 text-red-400">Short A+ Scenario</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-400">Entry Zone:</span>{' '}
                {report.short_scenario.entry_zone.low.toFixed(2)} -{' '}
                {report.short_scenario.entry_zone.high.toFixed(2)}
              </div>
              <div>
                <span className="text-gray-400">Stop:</span>{' '}
                {report.short_scenario.stop_loss.toFixed(2)}
              </div>
              <div>
                <span className="text-gray-400">Targets:</span>{' '}
                {report.short_scenario.targets.map((t) => t.toFixed(2)).join(', ')}
              </div>
              <div>
                <span className="text-gray-400">R:R:</span>{' '}
                {report.short_scenario.risk_reward.toFixed(1)}
              </div>
              <div className="pt-2 border-t border-red-700/50">
                <div className="text-gray-400 mb-1">Conditions:</div>
                <ul className="list-disc list-inside text-xs space-y-1">
                  {report.short_scenario.entry_conditions.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Liquidity Sweeps */}
      {report.session_liquidity_sweeps && report.session_liquidity_sweeps.length > 0 && (
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="font-medium mb-2">Liquidity Sweeps</h3>
          <div className="space-y-1 text-sm">
            {report.session_liquidity_sweeps.map((sweep, i) => (
              <div key={i} className="flex justify-between">
                <span className={sweep.type === 'BSL' ? 'text-red-400' : 'text-green-400'}>
                  {sweep.type}: {sweep.level}
                </span>
                <span>{sweep.price?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regenerate Button */}
      <div className="pt-4 border-t border-gray-700">
        <button
          onClick={handleGenerateReport}
          disabled={generating}
          className="w-full bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          {generating ? 'Regenerating...' : 'Regenerate Report'}
        </button>
      </div>
    </div>
  );
}
