import ProjectCard from "../ProjectCard";
import { useProjects } from "../../context/ProjectContext";

function Homecardlist({ limit }) {
    const { projects } = useProjects();
    const visibleProjects = limit
        ? projects.slice(0, limit)
        : projects;

    return (
        <>
            {visibleProjects.map((project) => (
                <ProjectCard
                    key={project.id || project._id}
                    {...project}
                />
            ))}
        </>
    );
}

export default Homecardlist;