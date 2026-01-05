import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { 
    UserIcon, 
    CubeIcon, 
    PhoneIcon, 
    ChevronLeftIcon, 
    ChevronRightIcon,
    ExclamationCircleIcon,
    PlusIcon,
    MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import './manage_supplier.css';

const API_URL = process.env.REACT_APP_API_URL;

// Skeleton Component for smoother loading experience
const SkeletonCard = () => (
    <div className="ms-card ms-skeleton">
        <div className="ms-card-top">
            <div className="ms-avatar-skeleton shimmer"></div>
            <div className="ms-info-skeleton">
                <div className="ms-line-skeleton shimmer" style={{ width: '70%' }}></div>
                <div className="ms-line-skeleton shimmer" style={{ width: '50%' }}></div>
            </div>
        </div>
        <div className="ms-card-bottom">
            <div className="ms-line-skeleton shimmer" style={{ width: '40%' }}></div>
            <div className="ms-line-skeleton shimmer" style={{ width: '30%' }}></div>
        </div>
    </div>
);

const ManageSupplier = () => {
    const navigate = useNavigate();
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    // Filter States
    const [searchName, setSearchName] = useState('');
    const [searchProduct, setSearchProduct] = useState('');
    
    // Pagination States
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Debounce Logic
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            fetchSuppliers();
        }, 500);

        return () => clearTimeout(delayDebounceFn);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchName, searchProduct, page]);

    const fetchSuppliers = async () => {
        setLoading(true);
        setError('');
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/suppliers`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    page: page,
                    limit: 12,
                    search_name: searchName,
                    search_product: searchProduct
                }
            });

            if (response.data && response.data.data) {
                setSuppliers(response.data.data);
                setHasMore(response.data.data.length === 12);
            }
        } catch (err) {
            console.error("Fetch error:", err);
            setError(err.response?.data?.error || 'Failed to load suppliers.');
        } finally {
            setLoading(false);
        }
    };

    const handleCardClick = (id) => {
        navigate(`/dashboard/suppliers/${id}`);
    };

    const handleAddSupplier = () => {
        navigate('/dashboard/suppliers/add');
    };

    return (
        <div className="ms-wrapper">
            <div className="ms-container">
                {/* Header Section */}
                <div className="ms-header">
                    <div className="ms-header-content">
                        <h2 className="ms-title">Supplier Management</h2>
                        <p className="ms-subtitle">Manage your vendor relationships</p>
                    </div>
                    
                    <div className="ms-actions">
                        {/* Search Inputs */}
                        <div className="ms-filters">
                            <div className="ms-input-group">
                                <MagnifyingGlassIcon className="ms-icon-input" />
                                <input 
                                    type="text" 
                                    placeholder="Search Name..." 
                                    value={searchName}
                                    onChange={(e) => { setSearchName(e.target.value); setPage(1); }}
                                />
                            </div>
                            <div className="ms-input-group">
                                <CubeIcon className="ms-icon-input" />
                                <input 
                                    type="text" 
                                    placeholder="By Product..." 
                                    value={searchProduct}
                                    onChange={(e) => { setSearchProduct(e.target.value); setPage(1); }}
                                />
                            </div>
                        </div>

                        {/* Add Button */}
                        <button className="ms-btn-add" onClick={handleAddSupplier}>
                            <PlusIcon className="ms-icon-btn" />
                            <span>Add New</span>
                        </button>
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="ms-error">
                        <ExclamationCircleIcon className="ms-icon-sm" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Content Grid */}
                <div className="ms-grid">
                    {loading ? (
                        // Render Skeletons while loading
                        Array.from({ length: 8 }).map((_, index) => (
                            <SkeletonCard key={index} />
                        ))
                    ) : suppliers.length > 0 ? (
                        suppliers.map((supplier) => (
                            <div 
                                key={supplier.supplier_id} 
                                className="ms-card fade-in"
                                onClick={() => handleCardClick(supplier.supplier_id)}
                            >
                                <div className="ms-card-top">
                                    <div className="ms-avatar">
                                        {supplier.supplier_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="ms-info">
                                        <h3>{supplier.supplier_name}</h3>
                                        <p className="ms-contact">
                                            <UserIcon className="ms-icon-xs" /> 
                                            {supplier.contact_person}
                                        </p>
                                    </div>
                                </div>
                                <div className="ms-card-divider"></div>
                                <div className="ms-card-bottom">
                                    <div className="ms-detail-row">
                                        <PhoneIcon className="ms-icon-xs" />
                                        <span>{supplier.phone || 'N/A'}</span>
                                    </div>
                                    <div className={`ms-status ${supplier.is_active ? 'active' : 'inactive'}`}>
                                        <span className="ms-dot"></span>
                                        {supplier.is_active ? 'Active' : 'Inactive'}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        !error && <div className="ms-empty">No suppliers found.</div>
                    )}
                </div>

                {/* Pagination Controls */}
                <div className="ms-pagination">
                    <button 
                        disabled={page === 1} 
                        onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                        className="ms-page-btn"
                    >
                        <ChevronLeftIcon className="ms-icon-sm" />
                    </button>
                    <span className="ms-page-info">Page {page}</span>
                    <button 
                        disabled={!hasMore} 
                        onClick={() => setPage(prev => prev + 1)}
                        className="ms-page-btn"
                    >
                        <ChevronRightIcon className="ms-icon-sm" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManageSupplier;