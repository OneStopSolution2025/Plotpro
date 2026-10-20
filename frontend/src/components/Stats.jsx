import './componens-css/Stats.css';


function Stats({ Content, icon: Icon, Heading }) {

    return (

        <div className="mini-stats">

            <div className="outer">

                <div className="icon-class">

                    {Icon && (
                        <Icon className="icon3" />
                    )}

                </div>


                <div className="details2">

                    <p className="tot-acre">
                        {Heading}
                    </p>

                    <p className="acre">
                        {Content}
                    </p>

                </div>

            </div>

        </div>

    );
}


export default Stats;