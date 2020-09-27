var express = require('express');
var router = express.Router();

/*

res.render renders a webpage from ejs

pass variables like this --> res.render('page', {var1: var1, var2: var2, etc...});

*/

router.get('/', (req, res) => {
	res.render('pages/index');
});

module.exports = router;