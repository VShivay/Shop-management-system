import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
    ArrowLeftIcon, 
    CheckCircleIcon, 
    PlusCircleIcon, 
    TrashIcon 
} from '@heroicons/react/24/outline';
import './add_product.css';

const API_URL = process.env.REACT_APP_API_URL;

const AddProduct = () => {
    const navigate = useNavigate();
    
    // Dropdown Data
    const [options, setOptions] = useState({ categories: [], units: [], suppliers: [], sales_channels: [] });
    
    // Form State
    const [formData, setFormData] = useState({
        product_name: '',
        category_id: '',
        unit_id: '',
        sales_channel: 'Both',
        low_stock_threshold: 10,
        opening_stock: 0,
        is_active: true,
        cost_price: '',
        retail_price: '',
        wholesale_price: '',
        suppliers: [] // Array of { supplier_id }
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch Options on Mount
    useEffect(() => {
        const fetchOptions = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`${API_URL}/products/dropdowns`, {
                     headers: { Authorization: `Bearer ${token}` }
                });
                setOptions(res.data);
            } catch (err) {
                console.error("Failed to load options", err);
                setError("Could not load form options.");
            }
        };
        fetchOptions();
    }, []);

    // Handlers
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    // --- Supplier Row Logic (Modified) ---
    const addSupplierRow = () => {
        setFormData(prev => ({
            ...prev,
            // supply_price removed here, we only need ID now
            suppliers: [...prev.suppliers, { supplier_id: '' }]
        }));
    };

    const removeSupplierRow = (index) => {
        const newSuppliers = formData.suppliers.filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, suppliers: newSuppliers }));
    };

    const handleSupplierChange = (index, value) => {
        const newSuppliers = [...formData.suppliers];
        newSuppliers[index].supplier_id = value;
        setFormData(prev => ({ ...prev, suppliers: newSuppliers }));
    };

    // Submit Logic
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Basic Validation
        if (!formData.retail_price && !formData.wholesale_price) {
            setError("At least one selling price (Retail or Wholesale) is required.");
            setLoading(false);
            return;
        }

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError("Authentication token missing. Please login again.");
                setLoading(false);
                return;
            }

            // Clean up payload
            const payload = {
                ...formData,
                category_id: formData.category_id || null,
                unit_id: formData.unit_id || null,
                retail_price: formData.retail_price || null,
                wholesale_price: formData.wholesale_price || null,
                // Ensure cost_price is sent as number
                cost_price: parseFloat(formData.cost_price),
                // Filter out empty supplier rows
                suppliers: formData.suppliers.filter(s => s.supplier_id)
            };

            await axios.post(`${API_URL}/products`, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            navigate('/dashboard/products'); 
        } catch (err) {
            console.error("Add product error:", err);
            if (err.response?.status === 401) {
                setError("Session expired. Please login again.");
            } else {
                setError(err.response?.data?.error || "Failed to create product.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="pf-container fade-in">
            {/* Header */}
            <div className="pf-header">
                <button className="pf-back-btn" onClick={() => navigate(-1)}>
                    <ArrowLeftIcon className="pf-icon" /> Back
                </button>
                <h2 className="pf-title">Add New Product</h2>
            </div>

            {error && <div className="pf-error-banner">{error}</div>}

            <form onSubmit={handleSubmit} className="pf-form-grid">
                
                {/* Section: Basic Info */}
                <div className="pf-card pf-span-2">
                    <h3 className="pf-card-title">Basic Information</h3>
                    <div className="pf-row">
                        <div className="pf-group">
                            <label>Product Name <span className="pf-req">*</span></label>
                            <input type="text" name="product_name" value={formData.product_name} onChange={handleChange} required placeholder="e.g. Wireless Mouse" />
                        </div>
                        <div className="pf-group">
                            <label>Category</label>
                            <select name="category_id" value={formData.category_id} onChange={handleChange}>
                                <option value="">Select Category</option>
                                {options.categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-group">
                            <label>Unit</label>
                            <select name="unit_id" value={formData.unit_id} onChange={handleChange}>
                                <option value="">Select Unit</option>
                                {options.units.map(u => <option key={u.unit_id} value={u.unit_id}>{u.unit_name}</option>)}
                            </select>
                        </div>
                        <div className="pf-group">
                            <label>Sales Channel</label>
                            <select name="sales_channel" value={formData.sales_channel} onChange={handleChange}>
                                {options.sales_channels.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        <div className="pf-group pf-checkbox-group">
                            <label>Active Status</label>
                            <label className="pf-switch">
                                <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleChange} />
                                <span className="pf-slider"></span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Section: Pricing & Inventory */}
                <div className="pf-card">
                    <h3 className="pf-card-title">Pricing & Stock</h3>
                    {/* Highlighted Cost Price since it now drives supplier cost */}
                    <div className="pf-group" style={{backgroundColor: '#f8fafc', padding: '10px', borderRadius: '6px'}}>
                        <label style={{fontWeight: 600}}>Cost Price (Supply Price) <span className="pf-req">*</span></label>
                        <input type="number" step="0.01" name="cost_price" value={formData.cost_price} onChange={handleChange} required placeholder="0.00" />
                        <small style={{color: '#64748b', fontSize: '0.8rem'}}>This price will be used for all linked suppliers.</small>
                    </div>
                    
                    <div className="pf-row">
                        <div className="pf-group">
                            <label>Retail Price</label>
                            <input type="number" step="0.01" name="retail_price" value={formData.retail_price} onChange={handleChange} />
                        </div>
                        <div className="pf-group">
                            <label>Wholesale Price</label>
                            <input type="number" step="0.01" name="wholesale_price" value={formData.wholesale_price} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="pf-separator"></div>
                    <div className="pf-row">
                        <div className="pf-group">
                            <label>Opening Stock</label>
                            <input type="number" name="opening_stock" value={formData.opening_stock} onChange={handleChange} />
                        </div>
                        <div className="pf-group">
                            <label>Low Stock Alert</label>
                            <input type="number" name="low_stock_threshold" value={formData.low_stock_threshold} onChange={handleChange} />
                        </div>
                    </div>
                </div>

                {/* Section: Suppliers */}
                <div className="pf-card">
                    <div className="pf-card-header-row">
                        <h3 className="pf-card-title">Linked Suppliers</h3>
                        <button type="button" className="pf-btn-text" onClick={addSupplierRow}>
                            <PlusCircleIcon className="pf-icon-xs" /> Add
                        </button>
                    </div>
                    
                    <div className="pf-suppliers-list">
                        {formData.suppliers.map((item, index) => (
                            <div key={index} className="pf-supplier-row slide-in" style={{ gridTemplateColumns: "1fr auto" }}>
                                {/* REMOVED Supply Price Input */}
                                <select 
                                    value={item.supplier_id} 
                                    onChange={(e) => handleSupplierChange(index, e.target.value)}
                                    required
                                    style={{width: '100%'}}
                                >
                                    <option value="">Select Supplier</option>
                                    {options.suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
                                </select>
                                
                                <button type="button" className="pf-btn-icon-danger" onClick={() => removeSupplierRow(index)}>
                                    <TrashIcon className="pf-icon-xs" />
                                </button>
                            </div>
                        ))}
                        {formData.suppliers.length === 0 && <p className="pf-empty-text">No suppliers linked yet.</p>}
                    </div>
                </div>

                {/* Actions */}
                <div className="pf-actions pf-span-2">
                    <button type="button" className="pf-btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
                    <button type="submit" className="pf-btn-primary" disabled={loading}>
                        {loading ? 'Saving...' : <><CheckCircleIcon className="pf-icon-sm" /> Save Product</>}
                    </button>
                </div>

            </form>
        </div>
    );
};

export default AddProduct;