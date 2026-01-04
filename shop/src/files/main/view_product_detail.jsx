// src/files/main/view_product_detail.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeftIcon, 
  CurrencyDollarIcon, 
  TruckIcon,
  PencilSquareIcon,
  TagIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline';
import './css/view_product_detail.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const ViewProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/products/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setProduct(res.data);
      } catch (err) {
        setError("Failed to load product details.");
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id, API_URL]);

  if (loading) return <div className="vpd-loading"><div className="vpd-spinner"></div></div>;
  
  if (error) return (
    <div className="vpd-error-container">
      <p>{error}</p>
      <button onClick={() => navigate('/dashboard/products')} className="vpd-btn-back">Go Back</button>
    </div>
  );

  if (!product) return null;

  return (
    <div className="vpd-container fade-in">
      {/* Navigation Bar */}
      <div className="vpd-nav">
        <button onClick={() => navigate('/dashboard/products')} className="vpd-back-link">
          <ArrowLeftIcon className="vpd-icon-sm" /> Back to Inventory
        </button>
        <div className="vpd-actions">
        <button 
            className="vpd-btn-edit"
           onClick={() => navigate(`/dashboard/products/edit/${id}`)}
            >
            <PencilSquareIcon className="vpd-icon-sm" /> Edit Product
          </button>
          </div>
      </div>

      {/* Hero Card with Basic Info */}
      <div className="vpd-header-card">
        <div className="vpd-title-section">
          <div className="vpd-badges">
            <span className="vpd-pill category">
                <TagIcon className="icon-xs" /> {product.category_name || 'Uncategorized'}
            </span>
            <span className={`vpd-pill status ${product.is_active ? 'active' : 'inactive'}`}>
              {product.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          
          <h1 className="vpd-title">{product.product_name}</h1>
          
          <div className="vpd-meta-row">
            <div className="meta-item">
                <span className="meta-label">Unit</span>
                <span className="meta-val">{product.unit_name}</span>
            </div>
            <div className="meta-divider"></div>
            <div className="meta-item">
                <span className="meta-label">Channel</span>
                <span className="meta-val flex-center">
                    <GlobeAltIcon className="icon-xs" /> {product.sales_channel || 'General'}
                </span>
            </div>
          </div>
        </div>
        
        {/* Stock Box */}
        <div className={`vpd-stock-box ${product.available_quantity <= product.low_stock_threshold ? 'warning-bg' : ''}`}>
          <div className="vpd-stock-label">Current Stock</div>
          <div className={`vpd-stock-val ${product.available_quantity <= product.low_stock_threshold ? 'text-danger' : ''}`}>
            {product.available_quantity}
          </div>
          <div className="vpd-stock-sub">Low Threshold: {product.low_stock_threshold}</div>
        </div>
      </div>

      <div className="vpd-grid">
        {/* Pricing Card */}
        <div className="vpd-card slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="vpd-card-head">
            <div className="icon-bg-blue"><CurrencyDollarIcon className="vpd-card-icon" /></div>
            <h3>Pricing Structure</h3>
          </div>
          <div className="vpd-price-list">
            <div className="vpd-price-row main-price">
              <span className="vpd-label">Retail Price</span>
              <span className="vpd-val highlight">${parseFloat(product.retail_price || 0).toFixed(2)}</span>
            </div>
            <div className="vpd-price-row">
              <span className="vpd-label">Wholesale Price</span>
              <span className="vpd-val">${parseFloat(product.wholesale_price || 0).toFixed(2)}</span>
            </div>
            <div className="vpd-price-row">
              <span className="vpd-label">Cost Price</span>
              <span className="vpd-val muted">${parseFloat(product.cost_price || 0).toFixed(2)}</span>
            </div>
            <div className="vpd-note">
              Price Effective From: {product.price_effective_date ? new Date(product.price_effective_date).toLocaleDateString() : 'N/A'}
            </div>
          </div>
        </div>

        {/* Suppliers Table Card */}
        <div className="vpd-card slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="vpd-card-head">
            <div className="icon-bg-purple"><TruckIcon className="vpd-card-icon" /></div>
            <h3>Supplier Information</h3>
          </div>
          <div className="vpd-table-wrap">
            {product.suppliers && product.suppliers.length > 0 ? (
              <table className="vpd-mini-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Contact</th>
                    <th className="text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {product.suppliers.map((s, idx) => (
                    <tr key={idx}>
                      <td>
                          <div className="supplier-name">{s.supplier_name}</div>
                      </td>
                      <td className="text-muted">{s.contact_person || '-'}</td>
                      <td className="text-right font-mono">${parseFloat(s.supply_price || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="vpd-empty-state">
                  <p>No suppliers linked to this product.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewProductDetail;