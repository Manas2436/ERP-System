function notFound(req,res){res.status(404).json({error:{message:'Route not found'}});}
function errors(err,req,res,next){
  if(res.headersSent)return next(err);
  const messages={ER_DUP_ENTRY:'A record with these details already exists.',ER_NO_REFERENCED_ROW_2:'A referenced record was not found.',ER_CHECK_CONSTRAINT_VIOLATED:'One or more values are invalid.',ER_TRUNCATED_WRONG_VALUE_FOR_FIELD:'One or more values are invalid.'};
  let status=500;let message='Internal server error';let code=null;
  if(err.name==='SessionError'&&Number.isInteger(err.statusCode)){status=err.statusCode;message=err.message;}
  else if(Number.isInteger(err.statusCode)&&err.statusCode>=400&&err.statusCode<500){status=err.statusCode;message=err.message;}
  else if(['ECONNREFUSED','ETIMEDOUT','PROTOCOL_CONNECTION_LOST','ER_ACCESS_DENIED_ERROR','ER_BAD_DB_ERROR'].includes(err.code)){status=503;code='DATABASE_UNAVAILABLE';message='The ERP database is unavailable. Check the database service and server configuration.';}
  else if(err.type==='entity.parse.failed'){status=400;message='Request body must contain valid JSON.';}
  else if(err.type==='entity.too.large'){status=413;message='Request body is too large.';}
  else if(err.sqlState==='45000'){
    const safeSqlMessages={
      'Published marks are locked':{status:409,message:'Results are already published. Marks can no longer be entered or changed.'},
      'Marks outside exam range':{status:400,message:'Marks are outside the allowed range for this exam.'},
      'Invalid exam registration':{status:404,message:'Exam registration was not found.'},
      'Invalid marks value':{status:400,message:'Marks must be a valid number within the exam range.'},
      'Faculty is not assigned to this offering':{status:403,message:'You are not assigned to this offering.'},
    };
    const known=safeSqlMessages[err.sqlMessage];
    status=known?.status||400;message=known?.message||'The requested operation violates a business rule.';
  }
  else if(messages[err.code]){status=err.code==='ER_DUP_ENTRY'?409:400;message=messages[err.code];}
  if(status>=500)console.error('API request failed',{method:req.method,path:req.path,errorCode:err.code||err.name,sqlState:err.sqlState||null});
  res.status(status).json({error:{...(code?{code}:{}),message}});
}
module.exports={notFound,errors};
