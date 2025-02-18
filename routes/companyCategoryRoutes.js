const express = require('express')
const router = express.Router()
const CompanyCategoryController = require('../controllers/companyCategoryController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE } = require('../utilities/constants')

router.get('/get-all-company-categories', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE]), CompanyCategoryController.getAllCompanyCategories)
router.post('/add-company-category', authenticate([ROLE_ADMIN]), CompanyCategoryController.addCategory)
router.delete('/delete-company-category/:categoryId', authenticate([ROLE_ADMIN]), CompanyCategoryController.deleteCategory)
router.put('/update-company-category/:categoryId', authenticate([ROLE_ADMIN]), CompanyCategoryController.updateCategory)

module.exports = router