const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '0.00';
    
    // Format to 2 decimal places first
    const n = Number(amount).toFixed(2);
    const parts = n.split('.');
    let integerPart = parts[0];
    const decimalPart = parts[1];

    // Regex for Indian Number System (1,00,000)
    let lastThree = integerPart.substring(integerPart.length - 3); // Changed from const to let
    const otherNumbers = integerPart.substring(0, integerPart.length - 3);
    
    if (otherNumbers !== '') {
        lastThree = ',' + lastThree;
    }
    
    const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;

    return formattedInteger + '.' + decimalPart;
};

module.exports = { formatCurrency };