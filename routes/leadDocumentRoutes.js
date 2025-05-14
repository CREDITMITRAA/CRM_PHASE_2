const express = require('express')
const router = express.Router()
const LeadDocumentController = require('../controllers/leadDocumentController')
const { authenticate } = require('../middlewares/authenticationMiddleware')
const { ROLE_ADMIN, ROLE_MANAGER, ROLE_EMPLOYEE, ROLE_OPERATIONS_TEAM } = require('../utilities/constants')

router.post('/add-lead-documents', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LeadDocumentController.addLeadDocuments)
router.get('/get-lead-documents-by-lead-id',authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LeadDocumentController.getLeadDocumentsByLeadId)
router.post('/remove-lead-document-by-lead-id', authenticate([ROLE_ADMIN,ROLE_MANAGER,ROLE_EMPLOYEE,ROLE_OPERATIONS_TEAM]), LeadDocumentController.deleteLeadDocument)

module.exports = router