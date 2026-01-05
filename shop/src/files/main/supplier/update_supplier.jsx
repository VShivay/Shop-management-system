import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    PencilSquareIcon, 
    ArrowLeftIcon,
    BuildingOfficeIcon,
    PhoneIcon,
    EnvelopeIcon,
    MapPinIcon,
    UserIcon,
    IdentificationIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import './update_supplier.css';

const API_URL = process.env.REACT_APP_API_URL;

// Skeleton Loader for initial data fetch
const UpdateSkeleton = () => (
    <div className="us-wrapper">
        <div className="us-container">
            <div className="us-header-skeleton shimmer"></div>
            <div className="us-card us-skeleton-card">
                <div className="us-grid">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="us-input-skeleton shimmer"></div>
                    ))}
                </div>
                <div className="us-action-skeleton shimmer"></div>
            </div>
        </div>
    </div>
);

const UpdateSupplier = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    
    const [formData, setFormData] = useState({
        supplier_name: '', contact_person: '', phone: '', 
        email: '', gst_number: '', address: '', is_active: true
    });
    
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const fetchSupplier = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`${API_URL}/suppliers/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const d = res.data.data;
                setFormData({
                    supplier_name: d.supplier_name,
                    contact_person: d.contact_person || '',
                    phone: d.phone || '',
                    email: d.email || '',
                    gst_number: d.gst_number || '',
                    address: d.address || '',
                    is_active: d.is_active
                });
            } catch (err) {
                setError('Failed to load supplier details.');
            } finally {
                setTimeout(() => setLoading(false), 600); // Small delay to show smooth skeleton
            }
        };
        fetchSupplier();
    }, [id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setSubmitting(true);

        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/suppliers/${id}`, formData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSuccess('Supplier updated successfully!');
            setTimeout(() => navigate('/dashboard/suppliers'), 1500);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update supplier.');
            setSubmitting(false);
        }
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    if (loading) return <UpdateSkeleton />;

    return (
        <div className="us-wrapper">
            <div className="us-container fade-in">
                {/* Header */}
                <div className="us-header">
                    <button onClick={() => navigate(-1)} className="us-back-btn">
                        <ArrowLeftIcon className="us-icon-sm" /> Cancel
                    </button>
                    <div className="us-title-block">
                        <h2>Edit Supplier</h2>
                        <p>Update vendor information</p>
                    </div>
                </div>

                {/* Form Card */}
                <form onSubmit={handleSubmit} className="us-card">
                    
                    {/* Alerts */}
                    {error && (
                        <div className="us-alert error">
                            <ExclamationTriangleIcon className="us-icon-sm" /> {error}
                        </div>
                    )}
                    {success && (
                        <div className="us-alert success">
                            <CheckCircleIcon className="us-icon-sm" /> {success}
                        </div>
                    )}

                    <div className="us-grid">
                        {/* Supplier Name */}
                        <div className="us-input-group">
                            <label>Supplier Name</label>
                            <div className="us-input-wrapper">
                                <BuildingOfficeIcon className="us-input-icon" />
                                <input 
                                    type="text" 
                                    name="supplier_name" 
                                    value={formData.supplier_name} 
                                    onChange={handleChange} 
                                    required
                                    placeholder="Company Name"
                                />
                            </div>
                        </div>

                        {/* Contact Person */}
                        <div className="us-input-group">
                            <label>Contact Person</label>
                            <div className="us-input-wrapper">
                                <UserIcon className="us-input-icon" />
                                <input 
                                    type="text" 
                                    name="contact_person" 
                                    value={formData.contact_person} 
                                    onChange={handleChange} 
                                    placeholder="Manager Name"
                                />
                            </div>
                        </div>

                        {/* Phone */}
                        <div className="us-input-group">
                            <label>Phone Number</label>
                            <div className="us-input-wrapper">
                                <PhoneIcon className="us-input-icon" />
                                <input 
                                    type="text" 
                                    name="phone" 
                                    value={formData.phone} 
                                    onChange={handleChange} 
                                    placeholder="+91..."
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div className="us-input-group">
                            <label>Email Address</label>
                            <div className="us-input-wrapper">
                                <EnvelopeIcon className="us-input-icon" />
                                <input 
                                    type="email" 
                                    name="email" 
                                    value={formData.email} 
                                    onChange={handleChange} 
                                    placeholder="example@mail.com"
                                />
                            </div>
                        </div>

                        {/* GST */}
                        <div className="us-input-group">
                            <label>GST Number</label>
                            <div className="us-input-wrapper">
                                <IdentificationIcon className="us-input-icon" />
                                <input 
                                    type="text" 
                                    name="gst_number" 
                                    value={formData.gst_number} 
                                    onChange={handleChange} 
                                    placeholder="GSTIN..."
                                />
                            </div>
                        </div>

                        {/* Status Toggle */}
                        <div className="us-input-group flex-align-end">
                            <label className="us-toggle-label">
                                <input 
                                    type="checkbox" 
                                    name="is_active" 
                                    checked={formData.is_active} 
                                    onChange={handleChange} 
                                />
                                <span className="us-slider"></span>
                                <span className="us-toggle-text">Active Status</span>
                            </label>
                        </div>

                        {/* Address (Full Width) */}
                        <div className="us-input-group full-width">
                            <label>Billing Address</label>
                            <div className="us-input-wrapper align-top">
                                <MapPinIcon className="us-input-icon mt-2" />
                                <textarea 
                                    name="address" 
                                    rows="3" 
                                    value={formData.address} 
                                    onChange={handleChange} 
                                    placeholder="Complete address..."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="us-divider"></div>

                    <div className="us-actions">
                        <button type="submit" className="us-btn-save" disabled={submitting}>
                            {submitting ? (
                                <span className="us-spinner"></span>
                            ) : (
                                <>
                                    <PencilSquareIcon className="us-icon-sm" /> Update Supplier
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UpdateSupplier;