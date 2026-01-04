import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    ArrowLeftIcon, 
    CheckCircleIcon, 
    PlusCircleIcon, 
    TrashIcon 
} from '@heroicons/react/24/outline';
// Reusing the same CSS for consistency and efficiency
import './css/add_product.css'; 

const API_URL = process.env.REACT_APP_API_URL;

const UpdateProduct = () => {
    const navigate = useNavigate();
    const { id } = useParams();

    const [options, setOptions] = useState({ categories: [], units: [], suppliers: [], sales_channels: [] });
    
    // Note: 'opening_stock' is removed for updates as inventory should be managed via logs
    const [formData, setFormData] = useState({
        product_name: '',
        category_id: '',
        unit_id: '',
        sales_channel: '',
        low_stock_threshold: 10,
        is_active: true,
        cost_price: '',
        retail_price: '',
        wholesale_price: '',
        suppliers: [] 
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Initial Fetch (Dropdowns + Product Details)
    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Get Token
                const token = localStorage.getItem('token');
                if (!token) {
                    setError("Authentication token missing. Please login again.");
                    setLoading(false);
                    return;
                }

                // 2. Configure Headers
                const authConfig = {
                    headers: { 'Authorization': `Bearer ${token}` }
                };

                // 3. Run requests in parallel with Auth Headers
                const [optionsRes, productRes] = await Promise.all([
                    axios.get(`${API_URL}/products/dropdowns`, authConfig),
                    axios.get(`${API_URL}/products/${id}`, authConfig)
                ]);

                setOptions(optionsRes.data);
                
                const p = productRes.data;
                
                // 4. Map backend data to form state
                setFormData({
                    product_name: p.product_name,
                    category_id: p.category_id || '',
                    unit_id: p.unit_id || '',
                    sales_channel: p.sales_channel,
                    low_stock_threshold: p.low_stock_threshold,
                    is_active: p.is_active,
                    cost_price: p.cost_price,
                    retail_price: p.retail_price || '',
                    wholesale_price: p.wholesale_price || '',
                    // Ensure suppliers map correctly to editable format
                    suppliers: p.suppliers.map(s => ({
                        supplier_id: optionsRes.data.suppliers.find(opt => opt.supplier_name === s.supplier_name)?.supplier_id || '',
                        supply_price: s.supply_price
                    }))
                });
                setLoading(false);
            } catch (err) {
                console.error("Error loading data:", err);
                if (err.response?.status === 401) {
                    setError("Session expired. Please login again.");
                } else {
                    setError("Failed to load product details.");
                }
                setLoading(false);
            }
        };

        fetchData();
    }, [id]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const addSupplierRow = () => {
        setFormData(prev => ({
            ...prev,
            suppliers: [...prev.suppliers, { supplier_id: '', supply_price: '' }]
        }));
    };

    const removeSupplierRow = (index) => {
        const newSuppliers = formData.suppliers.filter((_, i) => i !== index);
        setFormData(prev => ({ ...prev, suppliers: newSuppliers }));
    };

    const handleSupplierChange = (index, field, value) => {
        const newSuppliers = [...formData.suppliers];
        newSuppliers[index][field] = value;
        setFormData(prev => ({ ...prev, suppliers: newSuppliers }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // 1. Validation
        if (!formData.retail_price && !formData.wholesale_price) {
            setError("At least one selling price is required.");
            setLoading(false);
            return;
        }

        try {
            // 2. Get Token from Storage
            const token = localStorage.getItem('token');
            if (!token) {
                setError("Authentication token missing. Please login again.");
                setLoading(false);
                return;
            }

            // 3. Prepare Payload
            const payload = {
                ...formData,
                category_id: formData.category_id || null,
                unit_id: formData.unit_id || null,
                retail_price: formData.retail_price || null,
                wholesale_price: formData.wholesale_price || null,
            };

            // 4. Send Request with Headers
            await axios.put(`${API_URL}/products/${id}`, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`, // Add Token Here
                    'Content-Type': 'application/json'
                }
            });

            navigate('/dashboard/products');
        } catch (err) {
            console.error(err);
            // Handle 401 specifically if needed
            if (err.response?.status === 401) {
                setError("Session expired. Please login again.");
            } else {
                setError(err.response?.data?.error || "Failed to update product.");
            }
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="pf-container">Loading...</div>;

    return (
        <div className="pf-container fade-in">
            <div className="pf-header">
                <button className="pf-back-btn" onClick={() => navigate(-1)}>
                    <ArrowLeftIcon className="pf-icon" /> Back
                </button>
                <h2 className="pf-title">Edit Product: <span style={{color:'#4f46e5'}}>{formData.product_name}</span></h2>
            </div>

            {error && <div className="pf-error-banner">{error}</div>}

            <form onSubmit={handleSubmit} className="pf-form-grid">
                
                {/* Section: Basic Info */}
                <div className="pf-card pf-span-2">
                    <h3 className="pf-card-title">Basic Information</h3>
                    <div className="pf-row">
                        <div className="pf-group">
                            <label>Product Name <span className="pf-req">*</span></label>
                            <input type="text" name="product_name" value={formData.product_name} onChange={handleChange} required />
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
                    <h3 className="pf-card-title">Pricing & Limits</h3>
                    <div className="pf-group">
                        <label>Cost Price <span className="pf-req">*</span></label>
                        <input type="number" step="0.01" name="cost_price" value={formData.cost_price} onChange={handleChange} required />
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
                    <div className="pf-group">
                        <label>Low Stock Alert Threshold</label>
                        <input type="number" name="low_stock_threshold" value={formData.low_stock_threshold} onChange={handleChange} />
                    </div>
                    {/* Note: Opening stock is intentionally removed here */}
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
                            <div key={index} className="pf-supplier-row slide-in">
                                <select 
                                    value={item.supplier_id} 
                                    onChange={(e) => handleSupplierChange(index, 'supplier_id', e.target.value)}
                                    required
                                >
                                    <option value="">Select Supplier</option>
                                    {options.suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
                                </select>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    placeholder="Supply Price"
                                    value={item.supply_price}
                                    onChange={(e) => handleSupplierChange(index, 'supply_price', e.target.value)}
                                />
                                <button type="button" className="pf-btn-icon-danger" onClick={() => removeSupplierRow(index)}>
                                    <TrashIcon className="pf-icon-xs" />
                                </button>
                            </div>
                        ))}
                        {formData.suppliers.length === 0 && <p className="pf-empty-text">No suppliers linked.</p>}
                    </div>
                </div>

                {/* Actions */}
                <div className="pf-actions pf-span-2">
                    <button type="button" className="pf-btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
                    <button type="submit" className="pf-btn-primary" disabled={loading}>
                        {loading ? 'Saving...' : <><CheckCircleIcon className="pf-icon-sm" /> Update Product</>}
                    </button>
                </div>

            </form>
        </div>
    );
};

export default UpdateProduct;