const express = require("express")
const multer = require("multer")
const { authenticate } = require("../middlewares/authenticationMiddleware")
const { ROLE_ADMIN, ROLE_OPERATIONS_TEAM, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_VIEWER } = require("../utilities/constants")
const router = express.Router()
const CompanyController = require("../controllers/CompanyController")

// Multer setup for file upload
const upload = multer({ 
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
})

router.get('/search-company', authenticate([ROLE_ADMIN,ROLE_OPERATIONS_TEAM,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_VIEWER], false), CompanyController.searchCompanyForCategory)
router.post('/upload-companies-file', upload.single('file'), authenticate([ROLE_ADMIN, ROLE_OPERATIONS_TEAM, ROLE_MANAGER]), CompanyController.uploadCompaniesFromFile)

module.exports = router