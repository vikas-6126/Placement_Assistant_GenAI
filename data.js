const COMPANIES = {
  "TCS NQT": {
    rounds: "Online Aptitude, Technical Coding Test, Technical Interview, HR Interview",
    eligibility: "60% throughout academics, no active backlogs",
    focus: "Aptitude, basic DSA, SQL, OOPs, communication"
  },
  "Infosys": {
    rounds: "Online Test (Aptitude+Coding), Technical Interview, HR Interview",
    eligibility: "60-65% academics, no standing backlogs",
    focus: "Pseudocode logic, aptitude, DBMS, OS basics"
  },
  "Wipro": {
    rounds: "Online Assessment, Technical+HR combined interview",
    eligibility: "60% throughout, 0 backlogs",
    focus: "Aptitude, coding fundamentals, project explanation"
  },
  "Accenture": {
    rounds: "Cognitive+Technical Assessment, Coding Round, Communication Assessment, Interview",
    eligibility: "65% throughout academics",
    focus: "Aptitude, basic coding, English communication"
  },
  "Cognizant": {
    rounds: "Aptitude+Coding Test, Technical Interview, HR Interview",
    eligibility: "60% academics, max 1 backlog",
    focus: "Aptitude, OOPs, DBMS, basic coding"
  },
  "Amazon": {
    rounds: "Online Coding Assessment, Technical Interview 1 (DSA), Technical Interview 2 (DSA+LLD), Bar Raiser",
    eligibility: "Strong DSA, CGPA usually 7+",
    focus: "DSA, Leadership Principles, system design basics"
  },
  "Google": {
    rounds: "Online Assessment, Phone Screen, Onsite Rounds (DSA+Design), Googleyness/HR",
    eligibility: "Strong DSA/CS fundamentals",
    focus: "Advanced DSA, CS fundamentals, communication"
  },
  "Microsoft": {
    rounds: "Online Coding Round, Technical Interview 1-2, System Design, HR",
    eligibility: "CGPA 7+ typical, strong DSA",
    focus: "DSA, OOPs, basic system design"
  },
  "Capgemini": {
    rounds: "Pseudocode/Aptitude Test, Coding Test, Technical Interview, HR",
    eligibility: "60% throughout, no active backlog",
    focus: "Aptitude, pseudocode, communication"
  },
  "HCLTech": {
    rounds: "Aptitude+Technical MCQ, Technical Interview, HR",
    eligibility: "60% academics",
    focus: "Aptitude, core subject MCQs, communication"
  },
  "Tech Mahindra": {
    rounds: "AMCAT Aptitude Test, Technical Interview, HR/Versant Interview",
    eligibility: "60% throughout",
    focus: "Aptitude, communication, basic technical concepts"
  },
  "Deloitte": {
    rounds: "Online Cognitive+Technical Test, Group Discussion, Technical Interview, HR/Partner Interview",
    eligibility: "65%+ academics",
    focus: "Aptitude, case-thinking, SQL, communication"
  },
  "LTIMindtree": {
    rounds: "Aptitude+Technical MCQ, Coding Round, Technical Interview, HR",
    eligibility: "60% throughout",
    focus: "Aptitude, OOPs, DBMS, coding basics"
  },
  "Zoho": {
    rounds: "Written Test (Aptitude+Coding+Puzzles), Coding Round 2, Technical Interviews, HR",
    eligibility: "No strict CGPA cutoff",
    focus: "DSA, puzzles, OS/DBMS"
  },
  "Mu Sigma": {
    rounds: "Aptitude+Stats Test, Case Study/Group Discussion, Technical+HR Interview",
    eligibility: "Open to all branches, strong analytical/stats aptitude",
    focus: "Statistics, logical reasoning, business case thinking"
  },
  "IBM": {
    rounds: "Online Aptitude+Coding Test, Technical Interview, HR Interview",
    eligibility: "60%+ academics",
    focus: "Aptitude, programming basics, cloud fundamentals"
  },
  "Mphasis": {
    rounds: "Aptitude Test, Technical Interview, HR Interview",
    eligibility: "60% throughout, no active backlogs",
    focus: "Aptitude, programming basics, communication"
  },
  "Hexaware": {
    rounds: "Online Test (Aptitude+English+Coding), Technical Interview, HR Interview",
    eligibility: "60% throughout academics",
    focus: "Aptitude, coding basics, communication"
  },
  "Virtusa": {
    rounds: "Aptitude+Coding Test, Technical Interview, HR Interview",
    eligibility: "60%+ academics",
    focus: "Aptitude, DSA basics, OOPs"
  },
  "Larsen & Toubro (L&T) - Mechanical": {
    rounds: "Aptitude+Core Technical Test, GD, Technical Interview, HR Interview",
    eligibility: "60%+ academics, core branch knowledge essential",
    focus: "Thermodynamics, manufacturing, design"
  },
  "Siemens - EEE": {
    rounds: "Aptitude+Core Technical Test, Technical Interview, HR Interview",
    eligibility: "60%+ academics, core branch depth",
    focus: "Power systems, control systems, electrical machines"
  },
  "Texas Instruments - ECE": {
    rounds: "Online Technical+Aptitude Test, Technical Interview(s), HR Interview",
    eligibility: "70%+ academics typical",
    focus: "Digital electronics, signals, VLSI basics, C programming"
  },
  "AFCONS - Civil": {
    rounds: "Aptitude+Core Technical Test, Technical Interview, HR Interview",
    eligibility: "60%+ academics, core subject depth",
    focus: "Structural analysis, surveying, construction management"
  }
};

const COURSES = ["CSE", "IT", "ECE", "EEE", "Mech", "Civil", "Other"];