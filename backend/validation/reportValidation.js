const Joi = require('joi');

const reportFilterSchema = Joi.object({
    filterType: Joi.string().valid('today', 'date', 'month', 'year', 'range').default('today'),
    specificDate: Joi.date().iso().when('filterType', { is: 'date', then: Joi.required() }),
    month: Joi.number().min(1).max(12).when('filterType', { is: 'month', then: Joi.required() }),
    year: Joi.number().integer().min(2000).max(2100).when('filterType', { is: 'month', then: Joi.required() })
        .when('filterType', { is: 'year', then: Joi.required() }),
    startDate: Joi.date().iso().when('filterType', { is: 'range', then: Joi.required() }),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).when('filterType', { is: 'range', then: Joi.required() })
});

module.exports = { reportFilterSchema };