/**
 * Indian Rupee currency formatting utilities
 */

// Format number to Indian Rupee with proper formatting
const formatINR = (amount) => {
  if (typeof amount !== 'number') {
    amount = parseFloat(amount) || 0;
  }
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
};

// Format number to Indian number system (with commas)
const formatIndianNumber = (number) => {
  if (typeof number !== 'number') {
    number = parseFloat(number) || 0;
  }
  
  return new Intl.NumberFormat('en-IN').format(number);
};

// Convert paise to rupees
const paiseToRupees = (paise) => {
  return paise / 100;
};

// Convert rupees to paise
const rupeesToPaise = (rupees) => {
  return Math.round(rupees * 100);
};

// Get currency symbol
const getCurrencySymbol = () => {
  return '₹';
};

// Format price range
const formatPriceRange = (minPrice, maxPrice) => {
  if (minPrice === maxPrice) {
    return formatINR(minPrice);
  }
  return `${formatINR(minPrice)} - ${formatINR(maxPrice)}`;
};

// Calculate discount percentage
const calculateDiscount = (originalPrice, discountedPrice) => {
  if (originalPrice <= 0) return 0;
  return Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);
};

// Format discount
const formatDiscount = (originalPrice, discountedPrice) => {
  const discountPercent = calculateDiscount(originalPrice, discountedPrice);
  if (discountPercent <= 0) return null;
  return `${discountPercent}% OFF`;
};

// Validate price
const isValidPrice = (price) => {
  return typeof price === 'number' && price >= 0 && isFinite(price);
};

// Parse price from string (removes currency symbols and commas)
const parsePrice = (priceString) => {
  if (typeof priceString === 'number') return priceString;
  
  const cleaned = String(priceString)
    .replace(/[₹,]/g, '')
    .replace(/\s/g, '')
    .trim();
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

module.exports = {
  formatINR,
  formatIndianNumber,
  paiseToRupees,
  rupeesToPaise,
  getCurrencySymbol,
  formatPriceRange,
  calculateDiscount,
  formatDiscount,
  isValidPrice,
  parsePrice
}; 