import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeftIcon, 
  UserCircleIcon, 
  CurrencyRupeeIcon, 
  ClockIcon,
  PhoneIcon,
  MapPinIcon,
  EnvelopeIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import './customer_detail.css';

const API_URL = process.env.REACT_APP_API_URL;

const CustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/customers/${id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Customer not found');
        
        const result = await response.json();
        setData(result.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id]);

  if (loading) return <div className="cd-loader">Loading Profile...</div>;
  if (error) return <div className="cd-error">{error}</div>;
  if (!data) return null;

  const { profile, metrics, active_dues, transaction_history } = data;

  return (
    <div className="cd-container fade-in">
      {/* Top Navigation */}
      <button onClick={() => navigate(-1)} className="cd-back-btn">
        <ArrowLeftIcon className="w-4 h-4" /> Back to List
      </button>

      {/* Main Grid Layout */}
      <div className="cd-grid">
        
        {/* Left Column: Profile Card */}
        <div className="cd-col-left">
          <div className="cd-card cd-profile-card">
            <div className="cd-profile-header">
              <div className="cd-avatar-lg">{profile.customer_name.charAt(0)}</div>
              <h2 className="cd-name">{profile.customer_name}</h2>
              <span className={`cd-type-badge ${profile.customer_type}`}>
                {profile.customer_type}
              </span>
            </div>
            
            <div className="cd-divider"></div>
            
            <div className="cd-info-list">
              <div className="cd-info-item">
                <PhoneIcon className="cd-icon" />
                <span>{profile.phone || 'N/A'}</span>
              </div>
              <div className="cd-info-item">
                <EnvelopeIcon className="cd-icon" />
                <span>{profile.email || 'N/A'}</span>
              </div>
              <div className="cd-info-item">
                <MapPinIcon className="cd-icon" />
                <span>{profile.address || 'No address provided'}</span>
              </div>
            </div>

            <div className="cd-financial-summary">
                <div className="cd-fin-row">
                    <span>Credit Limit</span>
                    <span className="cd-val">₹{profile.credit_limit.toLocaleString()}</span>
                </div>
                <div className="cd-fin-row total">
                    <span>Current Balance</span>
                    <span className={`cd-val ${profile.current_balance > 0 ? 'text-danger' : 'text-success'}`}>
                        ₹{profile.current_balance.toLocaleString()}
                    </span>
                </div>
            </div>
          </div>
        </div>

        {/* Right Column: Metrics & Tables */}
        <div className="cd-col-right">
          
          {/* Metrics Cards */}
          <div className="cd-metrics-grid">
            <div className="cd-metric-card gradient-purple">
              <div className="cd-metric-icon"><DocumentTextIcon /></div>
              <div>
                <p className="cd-metric-label">Last Bill Amount</p>
                <h3 className="cd-metric-value">₹{metrics.last_bill_amount.toLocaleString()}</h3>
                <small>{metrics.last_bill_date ? new Date(metrics.last_bill_date).toLocaleDateString() : 'No bills'}</small>
              </div>
            </div>
            
            <div className="cd-metric-card gradient-orange">
               <div className="cd-metric-icon"><ClockIcon /></div>
              <div>
                <p className="cd-metric-label">Pending Dues</p>
                <h3 className="cd-metric-value">{metrics.total_active_dues_count}</h3>
                <small>Active unpaid bills</small>
              </div>
            </div>
          </div>

          {/* Active Dues Table */}
          <div className="cd-section-card">
            <h3 className="cd-section-title">Active Dues</h3>
            <div className="cd-table-wrap">
                <table className="cd-table">
                    <thead>
                        <tr>
                            <th>Bill No</th>
                            <th>Date</th>
                            <th>Total</th>
                            <th>Pending</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {active_dues.length === 0 ? (
                            <tr><td colSpan="5" className="text-center">No pending dues</td></tr>
                        ) : (
                            active_dues.map(due => (
                                <tr key={due.due_id}>
                                    <td>#{due.bill_number}</td>
                                    <td>{new Date(due.bill_date).toLocaleDateString()}</td>
                                    <td>₹{Number(due.total_bill_amount).toLocaleString()}</td>
                                    <td className="text-danger font-bold">₹{Number(due.balance_due).toLocaleString()}</td>
                                    <td><span className="cd-status-pill">{due.status}</span></td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
          </div>

           {/* Payment History Table */}
           <div className="cd-section-card">
            <h3 className="cd-section-title">Recent Transactions</h3>
            <div className="cd-table-wrap">
                <table className="cd-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Method</th>
                            <th>Bill Ref</th>
                        </tr>
                    </thead>
                    <tbody>
                         {transaction_history.length === 0 ? (
                            <tr><td colSpan="4" className="text-center">No recent transactions</td></tr>
                        ) : (
                            transaction_history.map((tx, idx) => (
                                <tr key={idx}>
                                    <td>{new Date(tx.payment_date).toLocaleDateString()}</td>
                                    <td className="text-success font-bold">+ ₹{Number(tx.amount_paid).toLocaleString()}</td>
                                    <td>{tx.payment_method || '-'}</td>
                                    <td className="text-muted">#{tx.bill_ref}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default CustomerDetail;