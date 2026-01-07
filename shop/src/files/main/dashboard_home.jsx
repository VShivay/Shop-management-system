import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    TrendingUp, 
    TrendingDown, 
    DollarSign, 
    ShoppingBag, 
    Truck, 
    Calendar,
    AlertCircle,
    Loader2,
    Package
} from 'lucide-react';
import './css/dashboard_home.css';

const API_URL = process.env.REACT_APP_API_URL;

const DashboardHome = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch Data on Mount
    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) throw new Error("No access token found.");

                const response = await axios.get(`${API_URL}/today-status`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                
                setData(response.data);
                setError(null);
            } catch (err) {
                console.error("Dashboard Fetch Error:", err);
                setError(err.response?.data?.error || "Failed to load dashboard data.");
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

    // Helper to format currency
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    if (loading) {
        return (
            <div className="dashboard-home-container loading-state">
                <Loader2 className="animate-spin" size={32} color="#4f46e5" />
                <p>Loading business insights...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard-home-container error-state">
                <AlertCircle size={32} color="#ef4444" />
                <p>{error}</p>
                <button className="retry-btn" onClick={() => window.location.reload()}>
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="dashboard-home-container fade-in">
            {/* Header Section */}
            <div className="dashboard-header">
                <div className="header-left">
                    <h1>Today's Overview</h1>
                    <p className="subtitle">
                        <Calendar size={14} style={{ marginRight: '4px' }} />
                        {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </div>
            </div>

            {/* Summary Cards Grid */}
            <div className="stats-grid">
                {/* Retail Card */}
                <div className="stat-card retail-gradient">
                    <div className="card-icon-bg">
                        <ShoppingBag size={20} color="white" />
                    </div>
                    <div className="card-content">
                        <h3>Retail</h3>
                        <div className="stat-row">
                            <span className="label">Revenue</span>
                            <span className="value">{formatCurrency(data?.summary?.retail?.revenue)}</span>
                        </div>
                        <div className="stat-row profit-row">
                            <span className="label">Profit</span>
                            <span className="value">
                                {formatCurrency(data?.summary?.retail?.profit)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Wholesale Card */}
                <div className="stat-card wholesale-gradient">
                    <div className="card-icon-bg">
                        <Truck size={20} color="white" />
                    </div>
                    <div className="card-content">
                        <h3>Wholesale</h3>
                        <div className="stat-row">
                            <span className="label">Revenue</span>
                            <span className="value">{formatCurrency(data?.summary?.wholesale?.revenue)}</span>
                        </div>
                        <div className="stat-row profit-row">
                            <span className="label">Profit</span>
                            <span className="value">
                                {formatCurrency(data?.summary?.wholesale?.profit)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Total Card */}
                <div className="stat-card total-gradient">
                    <div className="card-icon-bg">
                        <DollarSign size={20} color="white" />
                    </div>
                    <div className="card-content">
                        <h3>Total Performance</h3>
                        <div className="stat-row">
                            <span className="label">Total Revenue</span>
                            <span className="value">{formatCurrency(data?.summary?.total?.revenue)}</span>
                        </div>
                        <div className="stat-row profit-row">
                            <span className="label">Net Profit</span>
                            <span className="value">
                                {Number(data?.summary?.total?.profit) >= 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                                {formatCurrency(data?.summary?.total?.profit)}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Top Products Section */}
            <div className="tables-grid">
                {/* Top Retail Products */}
                <div className="table-card">
                    <div className="table-header">
                        <h2>Top Retail Products</h2>
                        <Package size={16} className="header-icon text-retail" />
                    </div>
                    <div className="table-responsive">
                        {data?.top_products?.retail?.length > 0 ? (
                            <table className="products-table">
                                <thead>
                                    <tr>
                                        <th>Product Name</th>
                                        <th className="text-right">Qty</th>
                                        <th className="text-right">Sales</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.top_products.retail.map((item, index) => (
                                        <tr key={index}>
                                            <td>{item.product_name}</td>
                                            <td className="text-right">{item.total_qty}</td>
                                            <td className="text-right font-medium">
                                                {formatCurrency(item.total_sales)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="empty-state">No retail sales today.</div>
                        )}
                    </div>
                </div>

                {/* Top Wholesale Products */}
                <div className="table-card">
                    <div className="table-header">
                        <h2>Top Wholesale Products</h2>
                        <Package size={16} className="header-icon text-wholesale" />
                    </div>
                    <div className="table-responsive">
                        {data?.top_products?.wholesale?.length > 0 ? (
                            <table className="products-table">
                                <thead>
                                    <tr>
                                        <th>Product Name</th>
                                        <th className="text-right">Qty</th>
                                        <th className="text-right">Sales</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.top_products.wholesale.map((item, index) => (
                                        <tr key={index}>
                                            <td>{item.product_name}</td>
                                            <td className="text-right">{item.total_qty}</td>
                                            <td className="text-right font-medium">
                                                {formatCurrency(item.total_sales)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="empty-state">No wholesale transactions today.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardHome;