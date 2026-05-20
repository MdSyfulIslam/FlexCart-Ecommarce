import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { FiBarChart2, FiDownload } from 'react-icons/fi';
import reviewGraphService from '../../services/reviewGraphService';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatPrice } from '../../utils/helpers';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import './ReviewGraph.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const ReviewGraph = () => {
  const [graphData, setGraphData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const chartRef = useRef(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const response = await reviewGraphService.getGraphData({
        month: selectedMonth, year: selectedYear
      });
      if (response.data.success) {
        setGraphData(response.data.data.graphData);
        setSummary(response.data.data.summary);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const handleDownloadPDF = async () => {
    try {
      const canvas = await html2canvas(chartRef.current);
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.setFontSize(18);
      pdf.text('FlexCart - Spending Review', 14, 20);
      pdf.setFontSize(12);
      pdf.text(`Month: ${selectedMonth}/${selectedYear}`, 14, 30);
      if (summary) {
        pdf.text(`Total Spent: ${formatPrice(summary.totalSpent)}`, 14, 38);
        pdf.text(`Total Orders: ${summary.totalOrders}`, 14, 46);
      }
      pdf.addImage(imgData, 'PNG', 10, 55, pdfWidth - 20, pdfHeight - 20);
      pdf.save(`FlexCart_Review_${selectedMonth}_${selectedYear}.pdf`);
      toast.success('PDF downloaded!');
    } catch (error) {
      toast.error('Failed to generate PDF');
    }
  };

  if (loading) return <LoadingSpinner />;

  const chartData = {
    labels: graphData?.map(d => d.day.toString()) || [],
    datasets: [{
      label: 'Daily Spending ($)',
      data: graphData?.map(d => d.totalSpent) || [],
      borderColor: 'rgb(79, 70, 229)',
      backgroundColor: 'rgba(79, 70, 229, 0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: 'rgb(79, 70, 229)',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: {
        callbacks: {
          label: (ctx) => `Spent: ${formatPrice(ctx.parsed.y)}`
        }
      }
    },
    scales: {
      x: { title: { display: true, text: 'Day of Month' }, grid: { display: false } },
      y: { title: { display: true, text: 'Total Spent ($)' }, beginAtZero: true }
    }
  };

  return (
    <div className="review-graph">
      <div className="section-header">
        <h2><FiBarChart2 /> Review Graph</h2>
        <div className="graph-controls">
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2024, i).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="download-btn" onClick={handleDownloadPDF}>
            <FiDownload size={16} /> Download PDF
          </button>
        </div>
      </div>

      {summary && (
        <div className="graph-summary">
          <div className="summary-card">
            <span className="summary-label">Total Spent</span>
            <span className="summary-value">{formatPrice(summary.totalSpent)}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">Total Orders</span>
            <span className="summary-value">{summary.totalOrders}</span>
          </div>
          <div className="summary-card">
            <span className="summary-label">Daily Average</span>
            <span className="summary-value">{formatPrice(summary.averageDaily)}</span>
          </div>
        </div>
      )}

      <div className="graph-container" ref={chartRef}>
        <Line data={chartData} options={chartOptions} />
      </div>
    </div>
  );
};

export default ReviewGraph;