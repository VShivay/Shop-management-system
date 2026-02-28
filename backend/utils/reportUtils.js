const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    // en-IN locale handles 1,00,000 format
    return new Intl.NumberFormat('en-IN', { 
        maximumFractionDigits: 2,
        minimumFractionDigits: 0 
    }).format(num);
};

const buildDateFilter = (filterType, query) => {
    let dateCondition = "";
    let params = [];
    const { specificDate, month, year, startDate, endDate } = query;

    switch (filterType) {
        case 'today':
            dateCondition = "DATE(il.change_date) = CURRENT_DATE";
            break;
        case 'date':
            dateCondition = "DATE(il.change_date) = $1";
            params.push(specificDate);
            break;
        case 'month':
            // Expects month (1-12) and year (e.g., 2024)
            dateCondition = "EXTRACT(MONTH FROM il.change_date) = $1 AND EXTRACT(YEAR FROM il.change_date) = $2";
            params.push(month, year);
            break;
        case 'year':
            dateCondition = "EXTRACT(YEAR FROM il.change_date) = $1";
            params.push(year);
            break;
        case 'range':
            dateCondition = "DATE(il.change_date) BETWEEN $1 AND $2";
            params.push(startDate, endDate);
            break;
        default:
            // Default to all time or current month if preferred, here we default to last 30 days
            dateCondition = "il.change_date >= CURRENT_DATE - INTERVAL '30 days'";
            break;
    }
    return { dateCondition, params };
};

module.exports = { formatNumber, buildDateFilter };